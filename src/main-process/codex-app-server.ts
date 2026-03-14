import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import readline from 'node:readline';

import type {
  CodexApprovalDecision,
  CodexApprovalKind,
  CodexSessionEvent,
  CodexSessionStatus,
  CodexUserInputQuestion,
} from '@/ipc/contracts';

import { codexExecutable } from './codex-cli';

type JsonRpcId = string | number;

type PendingRequest = {
  method: string;
  timeout: ReturnType<typeof setTimeout>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
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
  child: ChildProcessWithoutNullStreams;
  output: readline.Interface;
  nextRequestId: number;
  pending: Map<string, PendingRequest>;
  pendingApprovals: Map<string, PendingApprovalRequest>;
  pendingUserInputs: Map<string, PendingUserInputRequest>;
  status: CodexSessionStatus;
  threadId: string | null;
  activeTurnId: string | null;
  stopped: boolean;
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

const asObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asArray = (value: unknown): unknown[] | undefined =>
  Array.isArray(value) ? value : undefined;

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

export class CodexAppServerManager extends EventEmitter<{
  event: [CodexSessionEvent];
}> {
  private readonly sessions = new Map<string, SessionContext>();

  async sendPrompt(sessionId: string, cwd: string, prompt: string): Promise<void> {
    try {
      const context = await this.ensureSession(sessionId, cwd);
      const response = await this.sendRequest(context, 'turn/start', {
        threadId: context.threadId,
        input: [{ type: 'text', text: prompt, text_elements: [] }],
      });
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
    this.emitState(context, 'closed', null, 'Session stopped');
    this.sessions.delete(sessionId);
  }

  private async ensureSession(sessionId: string, cwd: string): Promise<SessionContext> {
    const existing = this.sessions.get(sessionId);

    if (existing && existing.status !== 'closed' && existing.cwd === cwd) {
      return existing;
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
      child,
      output,
      nextRequestId: 1,
      pending: new Map(),
      pendingApprovals: new Map(),
      pendingUserInputs: new Map(),
      status: 'connecting',
      threadId: null,
      activeTurnId: null,
      stopped: false,
    };

    this.sessions.set(sessionId, context);
    this.attachProcessListeners(context);
    this.emitState(context, 'connecting', null, 'Starting Codex');

    try {
      await this.sendRequest(context, 'initialize', {
        clientInfo: {
          name: 'devland',
          title: 'Devland',
          version: process.env.npm_package_version ?? '0.0.0',
        },
        capabilities: null,
      });
      this.writeMessage(context, { method: 'initialized' });

      const threadResponse = await this.sendRequest(context, 'thread/start', {
        cwd,
        approvalPolicy: 'on-request',
        sandbox: 'workspace-write',
        experimentalRawEvents: false,
        persistExtendedHistory: false,
      });
      const threadId =
        asString(asObject(asObject(threadResponse)?.thread)?.id) ??
        asString(asObject(threadResponse)?.threadId);

      if (!threadId) {
        throw new Error('Codex did not return a thread id.');
      }

      context.threadId = threadId;
      context.status = 'ready';
      this.emitState(context, 'ready', null, 'Ready');

      return context;
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
        label: 'Codex stderr',
        detail: message,
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
        label: 'Protocol error',
        detail: 'Received invalid JSON from Codex app-server.',
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
      this.handleNotification(context, parsed as JsonRpcNotification);
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

  private handleNotification(context: SessionContext, notification: JsonRpcNotification): void {
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
        context.status = status === 'failed' ? 'error' : 'ready';
        context.activeTurnId = null;
        this.emitState(
          context,
          status === 'failed' ? 'error' : 'ready',
          asString(turn?.id) ?? null,
          errorMessage,
        );
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
        });
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
      case 'item/started':
      case 'item/completed': {
        const item = asObject(params?.item) ?? params;
        const type = asString(item?.type) ?? 'item';
        const detail =
          asString(item?.command) ??
          asString(item?.summary) ??
          asString(item?.path) ??
          asString(item?.text) ??
          null;
        this.emit('event', {
          type: 'activity',
          sessionId: context.sessionId,
          tone: type.includes('command') || type.includes('file') ? 'tool' : 'info',
          label:
            notification.method === 'item/started'
              ? `Started ${type}`
              : `Completed ${type}`,
          detail,
        });
        return;
      }
      case 'error': {
        const message = asString(asObject(params?.error)?.message) ?? 'Codex error';
        context.status = 'error';
        this.emitState(context, 'error', context.activeTurnId, message);
        this.emit('event', {
          type: 'activity',
          sessionId: context.sessionId,
          tone: 'error',
          label: 'Codex error',
          detail: message,
        });
        return;
      }
      default:
        return;
    }
  }

  private handleResponse(context: SessionContext, response: JsonRpcResponse): void {
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
    context: SessionContext,
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

  private writeMessage(context: SessionContext, message: unknown): void {
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
