import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import readline from 'node:readline';

import type {
  CodexApprovalDecision,
  CodexApprovalKind,
  CodexPlanStep,
  CodexResumedThread,
  CodexSessionEvent,
  CodexSessionStatus,
  CodexThreadSummary,
  CodexUserInputQuestion,
} from '@/ipc/contracts';
import type {
  CodexComposerSettings,
  CodexImageAttachmentInput,
  CodexInteractionMode,
  CodexRuntimeMode,
} from '@/lib/codex-chat';
import {
  type CodexActivityItemType,
  formatCodexActivityLabel,
  isToolLifecycleItemType,
  toCodexActivityItemType,
} from '@/lib/codex-session-items';
import {
  captureGitWorkingTreeSnapshot,
  getGitSnapshotDiff,
} from '@/main-process/git';

import { codexExecutable } from './codex-cli';

type JsonRpcId = string | number;

type PendingRequest = {
  method: string;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type RequestContext = {
  child: ChildProcessWithoutNullStreams;
  nextRequestId: number;
  pending: Map<string, PendingRequest>;
};

type PendingApprovalRequest = {
  requestId: string;
  jsonRpcId: JsonRpcId;
  method:
    | 'item/commandExecution/requestApproval'
    | 'item/fileChange/requestApproval'
    | 'item/permissions/requestApproval'
    | 'applyPatchApproval'
    | 'execCommandApproval';
};

type PendingUserInputRequest = {
  requestId: string;
  jsonRpcId: JsonRpcId;
};

type SessionContext = {
  sessionId: string;
  cwd: string;
  runtimeMode: CodexRuntimeMode;
  child: RequestContext['child'];
  output: readline.Interface;
  nextRequestId: RequestContext['nextRequestId'];
  pending: RequestContext['pending'];
  pendingApprovals: Map<string, PendingApprovalRequest>;
  pendingUserInputs: Map<string, PendingUserInputRequest>;
  status: CodexSessionStatus;
  threadId: string | null;
  activeTurnId: string | null;
  activeTurnStartSnapshot: string | null;
  stopped: boolean;
};

type EnsureSessionResult = {
  context: SessionContext;
  didResumeFallback: boolean;
  threadResponse: unknown;
};

type JsonRpcRequest = {
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

type JsonRpcResponse = {
  id: JsonRpcId;
  result?: unknown;
  error?: {
    message?: string;
  };
};

type JsonRpcNotification = {
  method: string;
  params?: unknown;
};

const REQUEST_TIMEOUT_MS = 20_000;

const CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS = `<collaboration_mode># Plan Mode

You are in Plan Mode until new developer instructions explicitly switch modes.

Plan Mode is for exploration, clarification, and producing a decision-complete implementation plan. Do not make repo-tracked changes in this mode.

Use \`request_user_input\` for meaningful product or implementation decisions that cannot be resolved from the repo. Explore first, ask second.

When the plan is ready, output exactly one \`<proposed_plan>\` block containing Markdown only. The plan must be decision complete and include:

* A clear title
* A brief summary
* Implementation changes or interfaces to update
* Test coverage and verification scenarios
* Assumptions and defaults chosen

Do not implement the plan in the same turn.</collaboration_mode>`;

const CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS = `<collaboration_mode># Default Mode

You are in Default mode. Any previous plan-mode instructions are no longer active.

Execute the user's request directly when it is safe to do so. Use \`request_user_input\` only when a high-impact decision cannot be resolved from local context and making an assumption would be risky.</collaboration_mode>`;

export const buildCodexInitializeParams = () => ({
  clientInfo: {
    name: 'devland',
    title: 'Devland',
    version: process.env.npm_package_version ?? '0.0.0',
  },
  capabilities: {
    experimentalApi: true,
  },
});

export const shouldEmitCodexActivity = (itemType: CodexActivityItemType): boolean =>
  itemType !== 'reasoning';

export function parseCodexTurnPlanUpdate(params: unknown): {
  turnId: string | null;
  explanation: string | null;
  plan: CodexPlanStep[];
} | null {
  const payload = asObject(params);
  const rawPlan = asArray(payload?.plan);

  if (!rawPlan || rawPlan.length === 0) {
    return null;
  }

  const plan = rawPlan.flatMap((entry) => {
    const record = asObject(entry);
    const step = coalesceStrings(asString(record?.step));

    if (!step) {
      return [];
    }

    return [
      {
        step,
        status:
          record?.status === 'completed' || record?.status === 'inProgress'
            ? record.status
            : 'pending',
      },
    ] satisfies CodexPlanStep[];
  });

  if (plan.length === 0) {
    return null;
  }

  return {
    turnId: asString(payload?.turnId) ?? asString(asObject(payload?.turn)?.id) ?? null,
    explanation: coalesceStrings(asString(payload?.explanation)),
    plan,
  };
}

export const mapCodexRuntimeMode = (runtimeMode: CodexRuntimeMode) => {
  if (runtimeMode === 'full-access') {
    return {
      approvalPolicy: 'never' as const,
      sandbox: 'danger-full-access' as const,
    };
  }

  return {
    approvalPolicy: 'on-request' as const,
    sandbox: 'workspace-write' as const,
  };
};

export function buildCodexCollaborationMode(input: {
  interactionMode: CodexInteractionMode;
  model: string;
  reasoningEffort: string;
}): {
  mode: CodexInteractionMode;
  settings: {
    model: string;
    reasoning_effort: string;
    developer_instructions: string;
  };
} {
  return {
    mode: input.interactionMode,
    settings: {
      model: input.model,
      reasoning_effort: input.reasoningEffort,
      developer_instructions:
        input.interactionMode === 'plan'
          ? CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS
          : CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
    },
  };
}

export const buildCodexThreadOpenParams = ({
  cwd,
  settings,
}: {
  cwd: string;
  settings: CodexComposerSettings;
}) => ({
  cwd,
  model: settings.model,
  ...(settings.fastMode ? { serviceTier: 'fast' as const } : {}),
  ...mapCodexRuntimeMode(settings.runtimeMode),
  experimentalRawEvents: false,
  persistExtendedHistory: true,
});

export const buildCodexTurnStartParams = ({
  threadId,
  prompt,
  settings,
  attachments,
}: {
  threadId: string;
  prompt: string;
  settings: CodexComposerSettings;
  attachments: readonly CodexImageAttachmentInput[];
}) => {
  const input: Array<
    | { type: 'text'; text: string; text_elements: [] }
    | { type: 'image'; url: string }
  > = [];
  const trimmedPrompt = prompt.trim();

  if (trimmedPrompt.length > 0) {
    input.push({
      type: 'text',
      text: prompt,
      text_elements: [],
    });
  }

  for (const attachment of attachments) {
    input.push({
      type: 'image',
      url: attachment.dataUrl,
    });
  }

  if (input.length === 0) {
    throw new Error('Codex turn input requires prompt text or at least one image attachment.');
  }

  return {
    threadId,
    input,
    model: settings.model,
    effort: settings.reasoningEffort,
    collaborationMode: buildCodexCollaborationMode({
      interactionMode: settings.interactionMode,
      model: settings.model,
      reasoningEffort: settings.reasoningEffort,
    }),
    ...(settings.fastMode ? { serviceTier: 'fast' as const } : {}),
  };
};

const asObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const asArray = (value: unknown): unknown[] | undefined =>
  Array.isArray(value) ? value : undefined;

const coalesceStrings = (...values: Array<string | null | undefined>): string | null => {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
};

function parseTokenUsageBreakdown(value: unknown) {
  const record = asObject(value);
  const cachedInputTokens = asNumber(record?.cachedInputTokens);
  const inputTokens = asNumber(record?.inputTokens);
  const outputTokens = asNumber(record?.outputTokens);
  const reasoningOutputTokens = asNumber(record?.reasoningOutputTokens);
  const totalTokens = asNumber(record?.totalTokens);

  if (
    cachedInputTokens === undefined ||
    inputTokens === undefined ||
    outputTokens === undefined ||
    reasoningOutputTokens === undefined ||
    totalTokens === undefined
  ) {
    return null;
  }

  return {
    cachedInputTokens,
    inputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens,
  };
}

function parseThreadTokenUsage(value: unknown) {
  const record = asObject(value);
  const last = parseTokenUsageBreakdown(record?.last);
  const total = parseTokenUsageBreakdown(record?.total);
  const modelContextWindow = asNumber(record?.modelContextWindow);

  if (!last || !total) {
    return null;
  }

  return {
    last,
    total,
    modelContextWindow:
      modelContextWindow !== undefined && modelContextWindow > 0 ? modelContextWindow : null,
  };
}

const extractActivityDetail = (item: Record<string, unknown> | undefined): string | null =>
  coalesceStrings(
    asString(item?.command),
    asString(item?.summary),
    asString(item?.reason),
    asString(item?.path),
    asString(item?.filePath),
    asString(item?.title),
    asString(item?.name),
    asString(item?.text),
  );

const FILE_PATH_FIELD_NAMES = new Set([
  'path',
  'filepath',
  'file_path',
  'oldpath',
  'old_path',
  'newpath',
  'new_path',
  'targetpath',
  'target_path',
]);
const FILE_PATH_CONTAINER_FIELD_NAMES = new Set([
  'file',
  'files',
  'change',
  'changes',
  'edit',
  'edits',
  'result',
  'results',
  'target',
  'targets',
]);

function normalizeFilePathKey(key: string): string {
  return key.replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
}

function appendActivityFilePath(
  paths: string[],
  seenPaths: Set<string>,
  value: unknown,
): void {
  if (typeof value !== 'string') {
    return;
  }

  const normalizedPath = value.trim();

  if (normalizedPath === '' || seenPaths.has(normalizedPath)) {
    return;
  }

  seenPaths.add(normalizedPath);
  paths.push(normalizedPath);
}

function collectActivityFilePaths(
  value: unknown,
  paths: string[],
  seenPaths: Set<string>,
  depth = 0,
): void {
  if (depth > 4 || typeof value !== 'object' || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectActivityFilePaths(entry, paths, seenPaths, depth + 1);
    }
    return;
  }

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = normalizeFilePathKey(key);

    if (FILE_PATH_FIELD_NAMES.has(normalizedKey)) {
      appendActivityFilePath(paths, seenPaths, nestedValue);
      continue;
    }

    if (FILE_PATH_CONTAINER_FIELD_NAMES.has(normalizedKey)) {
      collectActivityFilePaths(nestedValue, paths, seenPaths, depth + 1);
    }
  }
}

export const extractActivityFilePaths = (
  itemType: CodexActivityItemType,
  item: Record<string, unknown> | undefined,
): string[] => {
  if (itemType !== 'file_change' || !item) {
    return [];
  }

  const paths: string[] = [];
  const seenPaths = new Set<string>();

  appendActivityFilePath(paths, seenPaths, item.filePath);
  appendActivityFilePath(paths, seenPaths, item.path);
  collectActivityFilePaths(item, paths, seenPaths);

  return paths;
};

const toApprovalKind = (method: PendingApprovalRequest['method']): CodexApprovalKind => {
  switch (method) {
    case 'item/commandExecution/requestApproval':
    case 'execCommandApproval':
      return 'command';
    case 'item/fileChange/requestApproval':
    case 'applyPatchApproval':
      return 'file-change';
    case 'item/permissions/requestApproval':
      return 'permissions';
    default:
      return 'generic';
  }
};

const toReviewDecision = (decision: CodexApprovalDecision): string => {
  switch (decision) {
    case 'accept':
      return 'approved';
    case 'acceptForSession':
      return 'approved_for_session';
    case 'decline':
      return 'denied';
    case 'cancel':
      return 'abort';
  }
};

const randomId = (): string =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const isoTimestampFromUnixSeconds = (seconds: number): string =>
  new Date(seconds * 1000).toISOString();

const basenameOfPath = (value: string): string => {
  const separatorIndex = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
  return separatorIndex === -1 ? value : value.slice(separatorIndex + 1);
};

function userInputToText(value: Record<string, unknown>): string | null {
  const type = asString(value.type);

  switch (type) {
    case 'text':
      return asString(value.text) ?? null;
    case 'image':
      return '[Attached image]';
    case 'localImage': {
      const path = asString(value.path);
      return path ? `[Attached image: ${basenameOfPath(path)}]` : '[Attached image]';
    }
    case 'skill':
      return asString(value.name) ? `Skill: ${asString(value.name)}` : null;
    case 'mention': {
      const path = asString(value.path);
      const name = asString(value.name);
      return path ?? name ?? null;
    }
    default:
      return null;
  }
}

export function parseCodexThreadSummaries(result: unknown): CodexThreadSummary[] {
  const threads = asArray(asObject(result)?.data) ?? [];

  return threads.flatMap((thread) => {
    const candidate = asObject(thread);
    const id = asString(candidate?.id);
    const cwd = asString(candidate?.cwd);
    const createdAt = asNumber(candidate?.createdAt);
    const updatedAt = asNumber(candidate?.updatedAt);

    if (!id || !cwd || createdAt === undefined || updatedAt === undefined) {
      return [];
    }

    return [{
      id,
      name: coalesceStrings(asString(candidate?.name)),
      preview: asString(candidate?.preview) ?? '',
      cwd,
      createdAt,
      updatedAt,
    }];
  });
}

export function parseCodexResumedThread(result: unknown): CodexResumedThread {
  const thread = asObject(asObject(result)?.thread);
  const threadId = asString(thread?.id);

  if (!threadId) {
    throw new Error('Codex did not return a thread id.');
  }

  const threadCreatedAt =
    asNumber(thread?.createdAt) ??
    asNumber(thread?.updatedAt) ??
    Math.floor(Date.now() / 1000);
  const turns = asArray(thread?.turns) ?? [];
  const messages: CodexResumedThread['messages'] = [];
  const messageIndexByItemId = new Map<string, number>();
  let messageOffset = 0;

  for (const turnCandidate of turns) {
    const turn = asObject(turnCandidate);
    const turnId = asString(turn?.id) ?? null;
    const turnStatus = asString(turn?.status);
    const items = asArray(turn?.items) ?? [];

    for (const itemCandidate of items) {
      const item = asObject(itemCandidate);
      const itemType = asString(item?.type);
      const createdAt = isoTimestampFromUnixSeconds(threadCreatedAt + messageOffset);
      messageOffset += 1;

      if (itemType === 'userMessage') {
        const content = asArray(item?.content) ?? [];
        const text = content
          .flatMap((contentItem) => {
            const nextText = userInputToText(asObject(contentItem) ?? {});
            return nextText ? [nextText] : [];
          })
          .join('\n\n');
        const itemId = asString(item?.id) ?? null;
        const existingIndex = itemId ? messageIndexByItemId.get(itemId) : undefined;

        if (existingIndex !== undefined) {
          const existingMessage = messages[existingIndex];

          if (existingMessage) {
            messages[existingIndex] = {
              ...existingMessage,
              text: text || existingMessage.text,
            };
          }

          continue;
        }

        const messageId = itemId ?? `${threadId}:user:${messages.length}`;

        messages.push({
          id: messageId,
          role: 'user',
          text,
          createdAt,
          completedAt: createdAt,
          turnId,
          itemId,
        });

        if (itemId) {
          messageIndexByItemId.set(itemId, messages.length - 1);
        }
        continue;
      }

      if (itemType === 'agentMessage') {
        const itemId = asString(item?.id) ?? null;
        const text = asString(item?.text) ?? '';
        const completedAt = turnStatus === 'inProgress' ? null : createdAt;
        const existingIndex = itemId ? messageIndexByItemId.get(itemId) : undefined;

        if (existingIndex !== undefined) {
          const existingMessage = messages[existingIndex];

          if (existingMessage) {
            messages[existingIndex] = {
              ...existingMessage,
              text: text || existingMessage.text,
              completedAt: completedAt ?? existingMessage.completedAt,
              itemId,
            };
          }

          continue;
        }

        const messageId = itemId ?? `${threadId}:assistant:${messages.length}`;

        messages.push({
          id: messageId,
          role: 'assistant',
          text,
          createdAt,
          completedAt,
          turnId,
          itemId,
        });

        if (itemId) {
          messageIndexByItemId.set(itemId, messages.length - 1);
        }
      }
    }
  }

  return {
    threadId,
    messages,
  };
}

export class CodexAppServerManager extends EventEmitter<{
  event: [CodexSessionEvent];
}> {
  private readonly sessions = new Map<string, SessionContext>();

  async listThreads(cwd: string, limit = 20): Promise<CodexThreadSummary[]> {
    return this.withStandaloneClient(cwd, async (context) => {
      const response = await this.sendRequest(
        context,
        'thread/list',
        {
          cwd,
          limit,
          sortKey: 'updated_at',
        },
      );

      return parseCodexThreadSummaries(response);
    });
  }

  async resumeThread(
    sessionId: string,
    cwd: string,
    settings: CodexComposerSettings,
    threadId: string,
  ): Promise<CodexResumedThread> {
    if (this.sessions.has(sessionId)) {
      this.stopSession(sessionId);
    }

    const { didResumeFallback, threadResponse } = await this.ensureSession(
      sessionId,
      cwd,
      settings,
      threadId,
    );

    if (didResumeFallback) {
      this.stopSession(sessionId);
      throw new Error('Codex could not resume the selected thread.');
    }

    return parseCodexResumedThread(threadResponse);
  }

  async sendPrompt(
    sessionId: string,
    cwd: string,
    prompt: string,
    settings: CodexComposerSettings,
    attachments: readonly CodexImageAttachmentInput[],
    resumeThreadId: string | null = null,
    transcriptBootstrap: string | null = null,
  ): Promise<void> {
    try {
      const { context, didResumeFallback } = await this.ensureSession(
        sessionId,
        cwd,
        settings,
        resumeThreadId,
      );
      const turnStartPrompt =
        didResumeFallback && transcriptBootstrap && transcriptBootstrap.trim().length > 0
          ? transcriptBootstrap
          : prompt;

      try {
        context.activeTurnStartSnapshot = await captureGitWorkingTreeSnapshot(cwd);
      } catch {
        context.activeTurnStartSnapshot = null;
      }

      if (didResumeFallback) {
        this.emit('event', {
          type: 'activity',
          sessionId,
          tone: 'info',
          phase: 'instant',
          label: 'Restored transcript context',
          detail: 'Started a new Codex thread because the previous one could not be resumed.',
          itemId: null,
          itemType: 'context_compaction',
        });
      }

      if (!context.threadId) {
        throw new Error('Codex session is missing a thread id.');
      }

      const response = await this.sendRequest(
        context,
        'turn/start',
        buildCodexTurnStartParams({
          threadId: context.threadId,
          prompt: turnStartPrompt,
          settings,
          attachments,
        }),
      );
      const turnId = asString(asObject(asObject(response)?.turn)?.id);
      context.status = 'running';
      context.activeTurnId = turnId ?? null;
      this.emitState(context, 'running', turnId ?? null, null);
    } catch (error) {
      this.emit('event', {
        type: 'state',
        sessionId,
        status: 'error',
        threadId: null,
        turnId: null,
        message:
          error instanceof Error ? error.message : 'Failed to start Codex turn.',
      });
      throw error;
    }
  }

  async interruptSession(sessionId: string): Promise<void> {
    const context = this.sessions.get(sessionId);
    if (!context || !context.threadId || !context.activeTurnId) {
      return;
    }

    await this.sendRequest(context, 'turn/interrupt', {
      threadId: context.threadId,
      turnId: context.activeTurnId,
    });
  }

  async respondToApproval(
    sessionId: string,
    requestId: string,
    decision: CodexApprovalDecision,
  ): Promise<void> {
    const context = this.requireSession(sessionId);
    const pending = context.pendingApprovals.get(requestId);

    if (!pending) {
      throw new Error(`Unknown pending approval request: ${requestId}`);
    }

    context.pendingApprovals.delete(requestId);
    this.writeMessage(context, {
      id: pending.jsonRpcId,
      result: {
        decision:
          pending.method === 'execCommandApproval' || pending.method === 'applyPatchApproval'
            ? toReviewDecision(decision)
            : decision,
      },
    });
    this.emit('event', {
      type: 'approval-resolved',
      sessionId,
      requestId,
      decision,
    });
  }

  async respondToUserInput(
    sessionId: string,
    requestId: string,
    answers: Record<string, string>,
  ): Promise<void> {
    const context = this.requireSession(sessionId);
    const pending = context.pendingUserInputs.get(requestId);

    if (!pending) {
      throw new Error(`Unknown pending user input request: ${requestId}`);
    }

    context.pendingUserInputs.delete(requestId);
    this.writeMessage(context, {
      id: pending.jsonRpcId,
      result: { answers },
    });
    this.emit('event', {
      type: 'user-input-resolved',
      sessionId,
      requestId,
    });
  }

  stopSession(sessionId: string): void {
    const context = this.sessions.get(sessionId);

    if (!context) {
      return;
    }

    context.stopped = true;
    for (const pending of context.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Session stopped before request completed.'));
    }
    context.pending.clear();
    context.pendingApprovals.clear();
    context.pendingUserInputs.clear();
    context.output.close();
    if (!context.child.killed) {
      context.child.kill();
    }
    context.status = 'closed';
    context.activeTurnId = null;
    context.activeTurnStartSnapshot = null;
    this.emitState(context, 'closed', null, 'Session stopped');
    this.sessions.delete(sessionId);
  }

  private async ensureSession(
    sessionId: string,
    cwd: string,
    settings: CodexComposerSettings,
    resumeThreadId: string | null = null,
  ): Promise<EnsureSessionResult> {
    const existing = this.sessions.get(sessionId);

    if (
      existing &&
      existing.status !== 'closed' &&
      existing.cwd === cwd &&
      existing.runtimeMode === settings.runtimeMode
    ) {
      return {
        context: existing,
        didResumeFallback: false,
        threadResponse: null,
      };
    }

    if (existing) {
      this.stopSession(sessionId);
    }

    if (codexExecutable === null) {
      throw new Error('Codex CLI is not installed. Install it from https://codex.openai.com');
    }

    const child = spawn(codexExecutable, ['app-server'], {
      cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output = readline.createInterface({ input: child.stdout });
    const context: SessionContext = {
      sessionId,
      cwd,
      runtimeMode: settings.runtimeMode,
      child,
      output,
      nextRequestId: 1,
      pending: new Map(),
      pendingApprovals: new Map(),
      pendingUserInputs: new Map(),
      status: 'connecting',
      threadId: null,
      activeTurnId: null,
      activeTurnStartSnapshot: null,
      stopped: false,
    };

    this.sessions.set(sessionId, context);
    this.attachProcessListeners(context);
    this.emitState(context, 'connecting', null, 'Starting Codex');

    try {
      await this.sendRequest(context, 'initialize', buildCodexInitializeParams());
      this.writeMessage(context, { method: 'initialized' });

      const threadParams = buildCodexThreadOpenParams({ cwd, settings });
      let threadResponse: unknown;
      let didResumeFallback = false;

      if (resumeThreadId) {
        try {
          threadResponse = await this.sendRequest(context, 'thread/resume', {
            ...threadParams,
            threadId: resumeThreadId,
          });
        } catch {
          didResumeFallback = true;
          threadResponse = await this.sendRequest(context, 'thread/start', threadParams);
        }
      } else {
        threadResponse = await this.sendRequest(context, 'thread/start', threadParams);
      }

      const threadId =
        asString(asObject(asObject(threadResponse)?.thread)?.id) ??
        asString(asObject(threadResponse)?.threadId);

      if (!threadId) {
        throw new Error('Codex did not return a thread id.');
      }

      context.threadId = threadId;
      context.status = 'ready';
      this.emitState(context, 'ready', null, 'Ready');

      return {
        context,
        didResumeFallback,
        threadResponse,
      };
    } catch (error) {
      this.emit('event', {
        type: 'state',
        sessionId,
        status: 'error',
        threadId: context.threadId,
        turnId: context.activeTurnId,
        message:
          error instanceof Error ? error.message : 'Failed to initialize Codex app-server.',
      });
      this.stopSession(sessionId);
      throw error;
    }
  }

  private requireSession(sessionId: string): SessionContext {
    const context = this.sessions.get(sessionId);

    if (!context) {
      throw new Error(`Unknown Codex session: ${sessionId}`);
    }

    return context;
  }

  private async withStandaloneClient<T>(
    cwd: string,
    run: (context: RequestContext) => Promise<T>,
  ): Promise<T> {
    if (codexExecutable === null) {
      throw new Error('Codex CLI is not installed. Install it from https://codex.openai.com');
    }

    const child = spawn(codexExecutable, ['app-server'], {
      cwd,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const output = readline.createInterface({ input: child.stdout });
    const context: RequestContext = {
      child,
      nextRequestId: 1,
      pending: new Map(),
    };
    let isClosed = false;

    const closeClient = () => {
      if (isClosed) {
        return;
      }

      isClosed = true;
      for (const pending of context.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Codex app-server client stopped before request completed.'));
      }
      context.pending.clear();
      output.close();
      if (!child.killed) {
        child.kill();
      }
    };

    output.on('line', (line) => {
      let parsed: unknown;

      try {
        parsed = JSON.parse(line);
      } catch {
        return;
      }

      if (
        parsed &&
        typeof parsed === 'object' &&
        'id' in parsed &&
        !('method' in parsed)
      ) {
        this.handleResponse(context, parsed as JsonRpcResponse);
      }
    });

    child.on('error', (error) => {
      for (const pending of context.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(error);
      }
      context.pending.clear();
    });

    child.on('exit', () => {
      for (const pending of context.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Codex app-server client exited unexpectedly.'));
      }
      context.pending.clear();
    });

    try {
      await this.sendRequest(context, 'initialize', buildCodexInitializeParams());
      this.writeMessage(context, { method: 'initialized' });

      return await run(context);
    } finally {
      closeClient();
    }
  }

  private attachProcessListeners(context: SessionContext): void {
    context.output.on('line', (line) => {
      this.handleStdoutLine(context, line);
    });

    context.child.stderr.on('data', (chunk: Buffer) => {
      const message = chunk.toString().trim();

      if (!message) {
        return;
      }

      this.emit('event', {
        type: 'activity',
        sessionId: context.sessionId,
        tone: 'error',
        phase: 'instant',
        label: 'Codex stderr',
        detail: message,
        itemId: null,
        itemType: 'error',
      });
    });

    context.child.on('error', (error) => {
      context.status = 'error';
      this.emitState(context, 'error', context.activeTurnId, error.message);
    });

    context.child.on('exit', (code, signal) => {
      if (context.stopped) {
        return;
      }

      context.status = 'closed';
      context.activeTurnId = null;
      this.emitState(
        context,
        'closed',
        null,
        `Codex exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
      );
      this.sessions.delete(context.sessionId);
    });
  }

  private handleStdoutLine(context: SessionContext, line: string): void {
    let parsed: unknown;

    try {
      parsed = JSON.parse(line);
    } catch {
      this.emit('event', {
        type: 'activity',
        sessionId: context.sessionId,
        tone: 'error',
        phase: 'instant',
        label: 'Protocol error',
        detail: 'Received invalid JSON from Codex app-server.',
        itemId: null,
        itemType: 'error',
      });
      return;
    }

    if (!parsed || typeof parsed !== 'object') {
      return;
    }

    if ('id' in parsed && 'method' in parsed) {
      this.handleServerRequest(context, parsed as JsonRpcRequest);
      return;
    }

    if ('method' in parsed) {
      void this.handleNotification(context, parsed as JsonRpcNotification).catch((error) => {
        this.emit('event', {
          type: 'activity',
          sessionId: context.sessionId,
          tone: 'error',
          phase: 'instant',
          label: 'Codex protocol error',
          detail:
            error instanceof Error
              ? error.message
              : 'Failed to process a Codex notification.',
          itemId: null,
          itemType: 'error',
        });
      });
      return;
    }

    if ('id' in parsed) {
      this.handleResponse(context, parsed as JsonRpcResponse);
    }
  }

  private handleServerRequest(context: SessionContext, request: JsonRpcRequest): void {
    const params = asObject(request.params);

    if (
      request.method === 'item/commandExecution/requestApproval' ||
      request.method === 'item/fileChange/requestApproval' ||
      request.method === 'item/permissions/requestApproval' ||
      request.method === 'applyPatchApproval' ||
      request.method === 'execCommandApproval'
    ) {
      const requestId = randomId();
      context.pendingApprovals.set(requestId, {
        requestId,
        jsonRpcId: request.id,
        method: request.method,
      });
      this.emit('event', {
        type: 'approval-requested',
        sessionId: context.sessionId,
        requestId,
        kind: toApprovalKind(request.method),
        title:
          request.method === 'item/commandExecution/requestApproval' ||
          request.method === 'execCommandApproval'
            ? 'Command approval requested'
            : request.method === 'item/fileChange/requestApproval' ||
                request.method === 'applyPatchApproval'
              ? 'File change approval requested'
              : 'Permission approval requested',
        detail: asString(params?.reason) ?? null,
        command: asString(params?.command) ?? null,
        cwd: asString(params?.cwd) ?? null,
      });
      return;
    }

    if (request.method === 'item/tool/requestUserInput') {
      const questions = this.parseUserInputQuestions(params);

      if (!questions.length) {
        this.writeMessage(context, {
          id: request.id,
          error: {
            code: -32602,
            message: 'Unsupported user input request.',
          },
        });
        return;
      }

      const requestId = randomId();
      context.pendingUserInputs.set(requestId, {
        requestId,
        jsonRpcId: request.id,
      });
      this.emit('event', {
        type: 'user-input-requested',
        sessionId: context.sessionId,
        requestId,
        questions,
      });
      return;
    }

    this.writeMessage(context, {
      id: request.id,
      error: {
        code: -32601,
        message: `Unsupported Codex server request: ${request.method}`,
      },
    });
  }

  private async handleNotification(
    context: SessionContext,
    notification: JsonRpcNotification,
  ): Promise<void> {
    const params = asObject(notification.params);

    switch (notification.method) {
      case 'thread/started': {
        const threadId = asString(asObject(params?.thread)?.id) ?? asString(params?.threadId);
        if (threadId) {
          context.threadId = threadId;
        }
        return;
      }
      case 'turn/started': {
        const turnId = asString(asObject(params?.turn)?.id);
        context.status = 'running';
        context.activeTurnId = turnId ?? null;
        this.emitState(context, 'running', turnId ?? null, null);
        return;
      }
      case 'turn/completed': {
        const turn = asObject(params?.turn);
        const status = asString(turn?.status);
        const errorMessage = asString(asObject(turn?.error)?.message) ?? null;
        const diff = await this.captureTurnDiff(context);
        context.status = status === 'failed' ? 'error' : 'ready';
        context.activeTurnId = null;
        this.emit('event', {
          type: 'turn-completed',
          sessionId: context.sessionId,
          turnId: asString(turn?.id) ?? null,
          status:
            status === 'failed'
              ? 'failed'
              : status === 'interrupted'
                ? 'interrupted'
                : status === 'cancelled'
                  ? 'cancelled'
                  : 'completed',
          error: errorMessage,
          completedAt: new Date().toISOString(),
          diff,
        });
        this.emitState(
          context,
          status === 'failed' ? 'error' : 'ready',
          asString(turn?.id) ?? null,
          errorMessage,
        );
        return;
      }
      case 'item/agentMessage/delta': {
        const text = asString(params?.delta) ?? '';
        if (text) {
          this.emit('event', {
            type: 'assistant-delta',
            sessionId: context.sessionId,
            itemId: asString(params?.itemId) ?? null,
            text,
          });
        }
        return;
      }
      case 'thread/tokenUsage/updated': {
        const tokenUsage = parseThreadTokenUsage(params?.tokenUsage);

        if (!tokenUsage) {
          return;
        }

        this.emit('event', {
          type: 'thread-token-usage-updated',
          sessionId: context.sessionId,
          threadId: asString(params?.threadId) ?? context.threadId,
          turnId: asString(params?.turnId) ?? context.activeTurnId,
          tokenUsage,
        });
        return;
      }
      case 'item/reasoning/summaryPartAdded':
      case 'item/plan/delta': {
        const rawType =
          notification.method === 'item/reasoning/summaryPartAdded' ? 'reasoning' : 'plan';
        const itemType = toCodexActivityItemType(rawType);
        const detail =
          asString(params?.delta) ??
          asString(params?.text) ??
          asString(asObject(params?.content)?.text) ??
          null;

        if (!detail) {
          return;
        }

        if (!shouldEmitCodexActivity(itemType)) {
          return;
        }

        this.emit('event', {
          type: 'activity',
          sessionId: context.sessionId,
          tone: 'info',
          phase: 'updated',
          itemId: asString(params?.itemId) ?? null,
          itemType,
          label: formatCodexActivityLabel({ itemType, rawType }),
          detail,
        });
        return;
      }
      case 'turn/plan/updated': {
        const planUpdate = parseCodexTurnPlanUpdate(params);

        if (!planUpdate) {
          return;
        }

        this.emit('event', {
          type: 'turn-plan-updated',
          sessionId: context.sessionId,
          turnId: planUpdate.turnId ?? context.activeTurnId,
          explanation: planUpdate.explanation,
          plan: planUpdate.plan,
        });
        return;
      }
      case 'item/started':
      case 'item/completed': {
        const item = asObject(params?.item) ?? params;
        const rawType = asString(item?.type) ?? asString(item?.kind) ?? 'item';
        const itemType = toCodexActivityItemType(rawType);
        const detail = extractActivityDetail(item);
        const filePaths = extractActivityFilePaths(itemType, item);
        const filePath = filePaths[0] ?? null;

        if (!shouldEmitCodexActivity(itemType)) {
          return;
        }

        this.emit('event', {
          type: 'activity',
          sessionId: context.sessionId,
          phase: notification.method === 'item/completed' ? 'completed' : 'started',
          tone: isToolLifecycleItemType(itemType) ? 'tool' : 'info',
          itemId: asString(item?.id) ?? asString(params?.itemId) ?? null,
          itemType,
          filePath,
          filePaths,
          label: formatCodexActivityLabel({
            itemType,
            rawType,
            title: asString(item?.title) ?? asString(item?.name) ?? null,
          }),
          detail,
        });
        return;
      }
      case 'error': {
        const message = asString(asObject(params?.error)?.message) ?? 'Codex error';
        context.status = 'error';
        context.activeTurnStartSnapshot = null;
        this.emitState(context, 'error', context.activeTurnId, message);
        this.emit('event', {
          type: 'activity',
          sessionId: context.sessionId,
          tone: 'error',
          phase: 'instant',
          label: 'Codex error',
          detail: message,
          itemId: null,
          itemType: 'error',
        });
        return;
      }
      default:
        return;
    }
  }

  private async captureTurnDiff(context: SessionContext) {
    const startSnapshot = context.activeTurnStartSnapshot;
    context.activeTurnStartSnapshot = null;

    if (!startSnapshot) {
      return null;
    }

    try {
      const endSnapshot = await captureGitWorkingTreeSnapshot(context.cwd);
      return await getGitSnapshotDiff(context.cwd, startSnapshot, endSnapshot);
    } catch {
      return null;
    }
  }

  private handleResponse(context: RequestContext, response: JsonRpcResponse): void {
    const key = String(response.id);
    const pending = context.pending.get(key);

    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    context.pending.delete(key);

    if (response.error?.message) {
      pending.reject(new Error(`${pending.method} failed: ${response.error.message}`));
      return;
    }

    pending.resolve(response.result);
  }

  private async sendRequest<TResponse>(
    context: RequestContext,
    method: string,
    params: unknown,
  ): Promise<TResponse> {
    const id = context.nextRequestId;
    context.nextRequestId += 1;

    const result = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        context.pending.delete(String(id));
        reject(new Error(`Timed out waiting for ${method}.`));
      }, REQUEST_TIMEOUT_MS);

      context.pending.set(String(id), {
        method,
        timeout,
        resolve,
        reject,
      });
      this.writeMessage(context, {
        id,
        method,
        params,
      });
    });

    return result as TResponse;
  }

  private writeMessage(context: RequestContext, message: unknown): void {
    if (!context.child.stdin.writable) {
      throw new Error('Cannot write to Codex stdin.');
    }

    context.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private emitState(
    context: SessionContext,
    status: CodexSessionStatus,
    turnId: string | null,
    message: string | null,
  ): void {
    this.emit('event', {
      type: 'state',
      sessionId: context.sessionId,
      status,
      threadId: context.threadId,
      turnId,
      message,
    });
  }

  private parseUserInputQuestions(payload: Record<string, unknown> | undefined): CodexUserInputQuestion[] {
    const questions = asArray(payload?.questions);

    if (!questions) {
      return [];
    }

    return questions.flatMap((candidate) => {
      const question = asObject(candidate);
      const options = asArray(question?.options);
      const id = asString(question?.id);
      const header = asString(question?.header);
      const prompt = asString(question?.question);

      if (!id || !header || !prompt || !options) {
        return [];
      }

      const parsedOptions = options.flatMap((option) => {
        const optionRecord = asObject(option);
        const label = asString(optionRecord?.label);
        const description = asString(optionRecord?.description);

        return label && description ? [{ label, description }] : [];
      });

      if (!parsedOptions.length) {
        return [];
      }

      return [
        {
          id,
          header,
          question: prompt,
          options: parsedOptions,
        },
      ];
    });
  }
}

export const codexAppServerManager = new CodexAppServerManager();
