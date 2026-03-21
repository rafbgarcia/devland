import type {
  CodexPlanStep,
  CodexSessionEvent,
  CodexSessionStatus,
  CodexResumedThread,
  CodexTurnDiff,
  CodexUserInputQuestion,
} from '@/ipc/contracts';
import type { CodexChatImageAttachment } from '@/lib/codex-chat';
import { isToolLifecycleItemType } from '@/lib/codex-session-items';
import { parseProposedPlanMessage, proposedPlanTitle } from '@/renderer/code-screen/proposed-plan';

const MAX_PERSISTED_SESSION_MESSAGES = 60;
const MAX_PERSISTED_DIFF_PATCH_CHARS = 24_000;

export type CodexChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  attachments: CodexChatImageAttachment[];
  createdAt: string;
  completedAt: string | null;
  turnId: string | null;
  itemId: string | null;
  diff: CodexTurnDiff | null;
  activities: CodexSessionActivity[];
};

export type CodexTranscriptEntry =
  | {
      id: string;
      kind: 'message';
      message: CodexChatMessage;
    }
  | {
      id: string;
      kind: 'work';
      activities: CodexSessionActivity[];
    };

export type CodexSessionActivity = {
  id: string;
  tone: 'info' | 'tool' | 'error';
  phase: 'started' | 'updated' | 'completed' | 'instant';
  label: string;
  detail: string | null;
  itemId: string | null;
  itemType: string | null;
};

export type PendingApproval = {
  requestId: string;
  kind: 'command' | 'file-change' | 'permissions' | 'generic';
  title: string;
  detail: string | null;
  command: string | null;
  cwd: string | null;
};

export type PendingUserInput = {
  requestId: string;
  questions: CodexUserInputQuestion[];
};

export type ActiveCodexPlan = {
  turnId: string | null;
  explanation: string | null;
  plan: CodexPlanStep[];
};

export type ProposedCodexPlan = {
  messageId: string;
  turnId: string | null;
  createdAt: string;
  title: string | null;
  planMarkdown: string;
};

export type CodexSessionState = {
  status: CodexSessionStatus;
  threadId: string | null;
  turnId: string | null;
  currentTurnStartedAt: string | null;
  activePlan: ActiveCodexPlan | null;
  latestProposedPlan: ProposedCodexPlan | null;
  transcriptEntries: CodexTranscriptEntry[];
  messages: CodexChatMessage[];
  currentTurnEntries: CodexTranscriptEntry[];
  pendingApprovals: PendingApproval[];
  pendingUserInputs: PendingUserInput[];
  error: string | null;
};

export type CodexSessionSnapshot = {
  threadId: string | null;
  activePlan?: ActiveCodexPlan | null;
  latestProposedPlan?: ProposedCodexPlan | null;
  transcriptEntries?: CodexTranscriptEntry[];
  messages: CodexChatMessage[];
  updatedAt: string;
};

export const DEFAULT_SESSION_STATE: CodexSessionState = {
  status: 'closed',
  threadId: null,
  turnId: null,
  currentTurnStartedAt: null,
  activePlan: null,
  latestProposedPlan: null,
  transcriptEntries: [],
  messages: [],
  currentTurnEntries: [],
  pendingApprovals: [],
  pendingUserInputs: [],
  error: null,
};

function shouldTrackActivity(event: Extract<CodexSessionEvent, { type: 'activity' }>) {
  if (event.tone === 'error') {
    return true;
  }

  return (
    isToolLifecycleItemType(event.itemType) ||
    event.itemType === 'context_compaction' ||
    event.tone === 'tool'
  );
}

function createMessageEntry(message: CodexChatMessage): CodexTranscriptEntry {
  return {
    id: message.id,
    kind: 'message',
    message,
  };
}

function createWorkEntry(
  sessionId: string,
  entries: CodexTranscriptEntry[],
  activity: CodexSessionActivity,
): CodexTranscriptEntry {
  return {
    id: `${sessionId}:work:${entries.length}`,
    kind: 'work',
    activities: [activity],
  };
}

function collectTranscriptMessages(entries: CodexTranscriptEntry[]): CodexChatMessage[] {
  return entries.flatMap((entry) => (entry.kind === 'message' ? [entry.message] : []));
}

function countTranscriptActivities(entries: CodexTranscriptEntry[]): number {
  return entries.reduce(
    (count, entry) => count + (entry.kind === 'work' ? entry.activities.length : 0),
    0,
  );
}

function updateLatestUserMessageTurnId(
  messages: CodexChatMessage[],
  turnId: string | null,
): CodexChatMessage[] {
  if (!turnId) {
    return messages;
  }

  const nextMessages = [...messages];

  for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
    const message = nextMessages[index];

    if (!message || message.role !== 'user' || message.turnId !== null) {
      continue;
    }

    nextMessages[index] = {
      ...message,
      turnId,
    };
    break;
  }

  return nextMessages;
}

function updateLatestUserTranscriptEntryTurnId(
  entries: CodexTranscriptEntry[],
  turnId: string | null,
): CodexTranscriptEntry[] {
  if (!turnId) {
    return entries;
  }

  const nextEntries = [...entries];

  for (let index = nextEntries.length - 1; index >= 0; index -= 1) {
    const entry = nextEntries[index];

    if (!entry || entry.kind !== 'message') {
      continue;
    }

    if (entry.message.role !== 'user' || entry.message.turnId !== null) {
      continue;
    }

    nextEntries[index] = {
      ...entry,
      message: {
        ...entry.message,
        turnId,
      },
    };
    break;
  }

  return nextEntries;
}

function appendAssistantDeltaEntry(
  entries: CodexTranscriptEntry[],
  input: {
    sessionId: string;
    turnId: string | null;
    itemId: string | null;
    text: string;
  },
): CodexTranscriptEntry[] {
  const nextEntries = [...entries];
  const targetItemId = input.itemId?.trim() ? input.itemId : null;

  if (targetItemId) {
    const existingIndex = nextEntries.findIndex(
      (entry) =>
        entry.kind === 'message' &&
        entry.message.role === 'assistant' &&
        entry.message.itemId === targetItemId,
    );

    if (existingIndex !== -1) {
      const existingEntry = nextEntries[existingIndex];

      if (existingEntry?.kind === 'message') {
        nextEntries[existingIndex] = {
          ...existingEntry,
          message: {
            ...existingEntry.message,
            text: `${existingEntry.message.text}${input.text}`,
          },
        };
      }

      return nextEntries;
    }
  }

  const lastEntry = nextEntries.at(-1);
  if (
    targetItemId === null &&
    lastEntry?.kind === 'message' &&
    lastEntry.message.role === 'assistant' &&
    lastEntry.message.itemId === null
  ) {
    nextEntries[nextEntries.length - 1] = {
      ...lastEntry,
      message: {
        ...lastEntry.message,
        text: `${lastEntry.message.text}${input.text}`,
      },
    };
    return nextEntries;
  }

  nextEntries.push(
    createMessageEntry({
      id: `${input.sessionId}:assistant:${targetItemId ?? nextEntries.length}`,
      role: 'assistant',
      text: input.text,
      attachments: [],
      createdAt: new Date().toISOString(),
      completedAt: null,
      turnId: input.turnId,
      itemId: targetItemId,
      diff: null,
      activities: [],
    }),
  );

  return nextEntries;
}

function appendActivityEntry(
  entries: CodexTranscriptEntry[],
  input: {
    sessionId: string;
    activity: CodexSessionActivity;
  },
): CodexTranscriptEntry[] {
  const nextEntries = [...entries];
  const lastEntry = nextEntries.at(-1);

  if (lastEntry?.kind === 'work') {
    nextEntries[nextEntries.length - 1] = {
      ...lastEntry,
      activities: [...lastEntry.activities, input.activity],
    };
    return nextEntries;
  }

  nextEntries.push(createWorkEntry(input.sessionId, nextEntries, input.activity));
  return nextEntries;
}

function finalizeTurnEntries(
  entries: CodexTranscriptEntry[],
  input: {
    sessionId: string;
    turnId: string | null;
    completedAt: string;
    diff: CodexTurnDiff | null;
  },
): CodexTranscriptEntry[] {
  let nextEntries = entries.map((entry) => {
    if (entry.kind !== 'message' || entry.message.role !== 'assistant') {
      return entry;
    }

    return {
      ...entry,
      message: {
        ...entry.message,
        completedAt: input.completedAt,
        turnId: input.turnId,
      },
    };
  });

  let lastAssistantIndex = -1;
  for (let index = nextEntries.length - 1; index >= 0; index -= 1) {
    const entry = nextEntries[index];
    if (entry?.kind === 'message' && entry.message.role === 'assistant') {
      lastAssistantIndex = index;
      break;
    }
  }

  if (lastAssistantIndex === -1 && input.diff) {
    nextEntries = [
      ...nextEntries,
      createMessageEntry({
        id: `${input.sessionId}:assistant:turn:${input.turnId ?? nextEntries.length}`,
        role: 'assistant',
        text: '',
        attachments: [],
        createdAt: input.completedAt,
        completedAt: input.completedAt,
        turnId: input.turnId,
        itemId: null,
        diff: input.diff,
        activities: [],
      }),
    ];
    return nextEntries;
  }

  if (lastAssistantIndex !== -1) {
    const entry = nextEntries[lastAssistantIndex];
    if (entry?.kind === 'message') {
      nextEntries[lastAssistantIndex] = {
        ...entry,
        message: {
          ...entry.message,
          diff: input.diff,
        },
      };
    }
  }

  return nextEntries;
}

function truncateDiff(diff: CodexTurnDiff): CodexTurnDiff {
  return {
    ...diff,
    patch:
      diff.patch.length <= MAX_PERSISTED_DIFF_PATCH_CHARS
        ? diff.patch
        : `${diff.patch.slice(0, MAX_PERSISTED_DIFF_PATCH_CHARS)}\n\n[diff truncated in persisted session history]`,
  };
}

function sanitizePersistedAttachmentPreviewUrl(previewUrl: string | null): string | null {
  if (previewUrl === null) {
    return null;
  }

  return previewUrl.startsWith('data:') || previewUrl.startsWith('blob:') ? null : previewUrl;
}

function sanitizeMessageForSnapshot(message: CodexChatMessage): CodexChatMessage {
  return {
    ...message,
    attachments: (message.attachments ?? []).map((attachment) => ({
      ...attachment,
      previewUrl: sanitizePersistedAttachmentPreviewUrl(attachment.previewUrl),
    })),
    diff: message.diff === null ? null : truncateDiff(message.diff),
  };
}

function sanitizeTranscriptEntryForSnapshot(entry: CodexTranscriptEntry): CodexTranscriptEntry {
  if (entry.kind === 'work') {
    return entry;
  }

  return {
    ...entry,
    message: sanitizeMessageForSnapshot(entry.message),
  };
}

function deriveTranscriptEntriesFromMessages(messages: CodexChatMessage[]): CodexTranscriptEntry[] {
  const entries: CodexTranscriptEntry[] = [];

  for (const message of messages) {
    if (message.role === 'assistant' && message.activities.length > 0) {
      entries.push({
        id: `${message.id}:work`,
        kind: 'work',
        activities: message.activities,
      });
    }

    entries.push(createMessageEntry(message));
  }

  return entries;
}

function findLatestProposedPlan(
  entries: ReadonlyArray<CodexTranscriptEntry>,
): ProposedCodexPlan | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (!entry || entry.kind !== 'message' || entry.message.role !== 'assistant') {
      continue;
    }

    const parsedPlan = parseProposedPlanMessage(entry.message.text);

    if (!parsedPlan) {
      continue;
    }

    return {
      messageId: entry.message.id,
      turnId: entry.message.turnId,
      createdAt: entry.message.createdAt,
      title: proposedPlanTitle(parsedPlan.planMarkdown),
      planMarkdown: parsedPlan.planMarkdown,
    };
  }

  return null;
}

function deriveLatestProposedPlan(state: Pick<CodexSessionState, 'transcriptEntries' | 'currentTurnEntries'>) {
  return findLatestProposedPlan([
    ...state.transcriptEntries,
    ...state.currentTurnEntries,
  ]);
}

function normalizeMessage(message: CodexChatMessage): CodexChatMessage {
  return {
    ...message,
    attachments: message.attachments ?? [],
  };
}

function normalizeTranscriptEntry(entry: CodexTranscriptEntry): CodexTranscriptEntry {
  if (entry.kind === 'work') {
    return entry;
  }

  return {
    ...entry,
    message: normalizeMessage(entry.message),
  };
}

export function hydrateResumedCodexThreadState(thread: CodexResumedThread): CodexSessionState {
  const messages = thread.messages.map((message) => ({
    id: message.id,
    role: message.role,
    text: message.text,
    attachments: [],
    createdAt: message.createdAt,
    completedAt: message.completedAt,
    turnId: message.turnId,
    itemId: message.itemId,
    diff: null,
    activities: [],
  }));
  const transcriptEntries = messages.map(createMessageEntry);

  return {
    ...DEFAULT_SESSION_STATE,
    status: 'ready',
    threadId: thread.threadId,
    latestProposedPlan: findLatestProposedPlan(transcriptEntries),
    transcriptEntries,
    messages,
  };
}

export function applyCodexSessionEvent(
  previous: CodexSessionState,
  event: CodexSessionEvent,
): CodexSessionState {
  switch (event.type) {
    case 'state': {
      const nextState = {
        ...previous,
        status: event.status,
        threadId: event.threadId ?? previous.threadId,
        turnId: event.turnId ?? previous.turnId,
        currentTurnStartedAt:
          event.status === 'running'
            ? previous.currentTurnStartedAt ?? new Date().toISOString()
            : event.status === 'ready' || event.status === 'closed' || event.status === 'error'
              ? null
              : previous.currentTurnStartedAt,
        activePlan:
          event.status === 'closed'
            ? null
            : event.status === 'running' &&
                event.turnId &&
                event.turnId !== previous.turnId
              ? null
              : previous.activePlan,
        error: event.status === 'error' ? event.message ?? previous.error : null,
      };
      return {
        ...nextState,
        latestProposedPlan: deriveLatestProposedPlan(nextState),
      };
    }
    case 'assistant-delta':
      {
        const nextState = {
        ...previous,
        currentTurnEntries: appendAssistantDeltaEntry(previous.currentTurnEntries, {
          sessionId: event.sessionId,
          turnId: previous.turnId,
          itemId: event.itemId ?? null,
          text: event.text,
        }),
      };
        return {
          ...nextState,
          latestProposedPlan: deriveLatestProposedPlan(nextState),
        };
      }
    case 'turn-plan-updated':
      return {
        ...previous,
        activePlan: {
          turnId: event.turnId ?? previous.turnId,
          explanation: event.explanation ?? null,
          plan: event.plan,
        },
      };
    case 'activity':
      if (!shouldTrackActivity(event)) {
        return previous;
      }

      {
        const nextState = {
        ...previous,
        currentTurnEntries: appendActivityEntry(previous.currentTurnEntries, {
          sessionId: event.sessionId,
          activity: {
            id: `${event.sessionId}:${countTranscriptActivities(previous.currentTurnEntries)}`,
            tone: event.tone,
            phase: event.phase,
            label: event.label,
            detail: event.detail ?? null,
            itemId: event.itemId ?? null,
            itemType: event.itemType ?? null,
          },
        }),
      };
        return {
          ...nextState,
          latestProposedPlan: deriveLatestProposedPlan(nextState),
        };
      }
    case 'approval-requested':
      return {
        ...previous,
        pendingApprovals: [
          ...previous.pendingApprovals,
          {
            requestId: event.requestId,
            kind: event.kind,
            title: event.title,
            detail: event.detail ?? null,
            command: event.command ?? null,
            cwd: event.cwd ?? null,
          },
        ],
      };
    case 'approval-resolved':
      return {
        ...previous,
        pendingApprovals: previous.pendingApprovals.filter(
          (approval) => approval.requestId !== event.requestId,
        ),
      };
    case 'user-input-requested':
      return {
        ...previous,
        pendingUserInputs: [
          ...previous.pendingUserInputs,
          {
            requestId: event.requestId,
            questions: event.questions,
          },
        ],
      };
    case 'user-input-resolved':
      return {
        ...previous,
        pendingUserInputs: previous.pendingUserInputs.filter(
          (input) => input.requestId !== event.requestId,
        ),
      };
    case 'turn-completed': {
      const completedAt = event.completedAt ?? new Date().toISOString();
      const nextStatus: CodexSessionStatus = event.status === 'failed' ? 'error' : 'ready';
      const completedEntries = finalizeTurnEntries(previous.currentTurnEntries, {
        sessionId: event.sessionId,
        turnId: event.turnId ?? null,
        completedAt,
        diff: event.diff ?? null,
      });
      const transcriptEntries = updateLatestUserTranscriptEntryTurnId(
        [...previous.transcriptEntries, ...completedEntries],
        event.turnId ?? null,
      );
      const messages = updateLatestUserMessageTurnId(
        [...previous.messages, ...collectTranscriptMessages(completedEntries)],
        event.turnId ?? null,
      );

      {
        const nextState = {
        ...previous,
        turnId: null,
        currentTurnStartedAt: null,
        status: nextStatus,
        error: event.status === 'failed' ? event.error ?? previous.error : null,
        transcriptEntries,
        messages,
        currentTurnEntries: [],
      };
        return {
          ...nextState,
          latestProposedPlan: deriveLatestProposedPlan(nextState),
        };
      }
    }
  }
}

export function toCodexSessionSnapshot(state: CodexSessionState): CodexSessionSnapshot | null {
  if (!state.threadId && state.messages.length === 0) {
    return null;
  }

  const messages = state.messages
    .slice(-MAX_PERSISTED_SESSION_MESSAGES)
    .map(sanitizeMessageForSnapshot);
  const transcriptEntries = state.transcriptEntries
    .slice(-(MAX_PERSISTED_SESSION_MESSAGES * 3))
    .map(sanitizeTranscriptEntryForSnapshot);

  return {
    threadId: state.threadId,
    activePlan: state.activePlan,
    latestProposedPlan: state.latestProposedPlan,
    transcriptEntries,
    messages,
    updatedAt: new Date().toISOString(),
  };
}

export function hydrateCodexSessionState(snapshot: CodexSessionSnapshot | null): CodexSessionState {
  if (!snapshot) {
    return DEFAULT_SESSION_STATE;
  }

  const transcriptEntries =
    snapshot.transcriptEntries && snapshot.transcriptEntries.length > 0
      ? snapshot.transcriptEntries.map(normalizeTranscriptEntry)
      : deriveTranscriptEntriesFromMessages(snapshot.messages.map(normalizeMessage));
  const messages = snapshot.messages.map(normalizeMessage);

  return {
    ...DEFAULT_SESSION_STATE,
    threadId: snapshot.threadId,
    activePlan: snapshot.activePlan ?? null,
    latestProposedPlan: snapshot.latestProposedPlan ?? findLatestProposedPlan(transcriptEntries),
    transcriptEntries,
    messages:
      snapshot.transcriptEntries && snapshot.transcriptEntries.length > 0
        ? collectTranscriptMessages(transcriptEntries)
        : messages,
  };
}
