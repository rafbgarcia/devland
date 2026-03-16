import type {
  CodexSessionEvent,
  CodexSessionStatus,
  CodexTurnDiff,
  CodexUserInputQuestion,
} from '@/ipc/contracts';
import { isToolLifecycleItemType } from '@/lib/codex-session-items';

export type CodexChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  completedAt: string | null;
  turnId: string | null;
  diff: CodexTurnDiff | null;
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

export type CodexSessionState = {
  status: CodexSessionStatus;
  threadId: string | null;
  turnId: string | null;
  currentTurnStartedAt: string | null;
  messages: CodexChatMessage[];
  streamingAssistantText: string;
  currentTurnActivities: CodexSessionActivity[];
  pendingApprovals: PendingApproval[];
  pendingUserInputs: PendingUserInput[];
  error: string | null;
};

export type CodexSessionSnapshot = {
  threadId: string | null;
  messages: CodexChatMessage[];
  updatedAt: string;
};

export const DEFAULT_SESSION_STATE: CodexSessionState = {
  status: 'closed',
  threadId: null,
  turnId: null,
  currentTurnStartedAt: null,
  messages: [],
  streamingAssistantText: '',
  currentTurnActivities: [],
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
    event.itemType === 'reasoning' ||
    event.itemType === 'plan' ||
    event.itemType === 'context_compaction' ||
    event.tone === 'tool'
  );
}

export function applyCodexSessionEvent(
  previous: CodexSessionState,
  event: CodexSessionEvent,
): CodexSessionState {
  switch (event.type) {
    case 'state':
      return {
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
        error: event.status === 'error' ? event.message ?? previous.error : null,
      };
    case 'assistant-delta':
      return {
        ...previous,
        streamingAssistantText: `${previous.streamingAssistantText}${event.text}`,
      };
    case 'activity':
      if (!shouldTrackActivity(event)) {
        return previous;
      }

      return {
        ...previous,
        currentTurnActivities: [
          ...previous.currentTurnActivities,
          {
            id: `${event.sessionId}:${previous.currentTurnActivities.length}`,
            tone: event.tone,
            phase: event.phase,
            label: event.label,
            detail: event.detail ?? null,
            itemId: event.itemId ?? null,
            itemType: event.itemType ?? null,
          },
        ],
      };
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
      const hasText = previous.streamingAssistantText.trim().length > 0;
      const hasActivities = previous.currentTurnActivities.length > 0;
      const shouldAddMessage = hasText || hasActivities;

      return {
        ...previous,
        turnId: null,
        currentTurnStartedAt: null,
        status: event.status === 'failed' ? 'error' : 'ready',
        error: event.status === 'failed' ? event.error ?? previous.error : null,
        messages: shouldAddMessage
          ? [
              ...previous.messages,
              {
                id: `${event.sessionId}:assistant:${previous.messages.length}`,
                role: 'assistant',
                text: previous.streamingAssistantText,
                createdAt:
                  previous.currentTurnStartedAt ??
                  event.completedAt ??
                  new Date().toISOString(),
                completedAt: event.completedAt ?? new Date().toISOString(),
                turnId: event.turnId ?? null,
                diff: event.diff ?? null,
                activities: previous.currentTurnActivities,
              },
            ]
          : previous.messages,
        streamingAssistantText: '',
        currentTurnActivities: [],
      };
    }
  }
}

export function toCodexSessionSnapshot(state: CodexSessionState): CodexSessionSnapshot | null {
  if (!state.threadId && state.messages.length === 0) {
    return null;
  }

  return {
    threadId: state.threadId,
    messages: state.messages,
    updatedAt: new Date().toISOString(),
  };
}

export function hydrateCodexSessionState(snapshot: CodexSessionSnapshot | null): CodexSessionState {
  if (!snapshot) {
    return DEFAULT_SESSION_STATE;
  }

  return {
    ...DEFAULT_SESSION_STATE,
    threadId: snapshot.threadId,
    messages: snapshot.messages,
  };
}
