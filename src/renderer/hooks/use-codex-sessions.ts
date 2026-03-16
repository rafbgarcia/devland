import { atom, useAtomValue, useSetAtom } from 'jotai';

import type {
  CodexApprovalDecision,
  CodexSessionEvent,
  CodexSessionStatus,
  CodexUserInputQuestion,
} from '@/ipc/contracts';
import { appJotaiStore } from '@/renderer/lib/jotai-store';

export type CodexChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  activities: CodexSessionActivity[];
};

export type CodexSessionActivity = {
  id: string;
  tone: 'info' | 'tool' | 'error';
  label: string;
  detail: string | null;
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
  messages: CodexChatMessage[];
  streamingAssistantText: string;
  currentTurnActivities: CodexSessionActivity[];
  pendingApprovals: PendingApproval[];
  pendingUserInputs: PendingUserInput[];
  error: string | null;
};

const DEFAULT_SESSION_STATE: CodexSessionState = {
  status: 'closed',
  threadId: null,
  turnId: null,
  messages: [],
  streamingAssistantText: '',
  currentTurnActivities: [],
  pendingApprovals: [],
  pendingUserInputs: [],
  error: null,
};

const sessionStatesAtom = atom<Record<string, CodexSessionState>>({});

const updateSessionEventAtom = atom(
  null,
  (get, set, event: CodexSessionEvent) => {
    const current = get(sessionStatesAtom);
    const previous = current[event.sessionId] ?? DEFAULT_SESSION_STATE;
    let nextState = previous;

    switch (event.type) {
      case 'state':
        nextState = {
          ...previous,
          status: event.status,
          threadId: event.threadId ?? previous.threadId,
          turnId: event.turnId ?? previous.turnId,
          error: event.status === 'error' ? event.message ?? previous.error : null,
        };
        break;
      case 'assistant-delta':
        nextState = {
          ...previous,
          streamingAssistantText: `${previous.streamingAssistantText}${event.text}`,
        };
        break;
      case 'activity':
        nextState = {
          ...previous,
          currentTurnActivities: [
            ...previous.currentTurnActivities,
            {
              id: `${event.sessionId}:${previous.currentTurnActivities.length}`,
              tone: event.tone,
              label: event.label,
              detail: event.detail ?? null,
            },
          ],
        };
        break;
      case 'approval-requested':
        nextState = {
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
        break;
      case 'approval-resolved':
        nextState = {
          ...previous,
          pendingApprovals: previous.pendingApprovals.filter(
            (approval) => approval.requestId !== event.requestId,
          ),
        };
        break;
      case 'user-input-requested':
        nextState = {
          ...previous,
          pendingUserInputs: [
            ...previous.pendingUserInputs,
            {
              requestId: event.requestId,
              questions: event.questions,
            },
          ],
        };
        break;
      case 'user-input-resolved':
        nextState = {
          ...previous,
          pendingUserInputs: previous.pendingUserInputs.filter(
            (input) => input.requestId !== event.requestId,
          ),
        };
        break;
      case 'turn-completed': {
        const hasText = previous.streamingAssistantText.trim().length > 0;
        const hasActivities = previous.currentTurnActivities.length > 0;
        const shouldAddMessage = hasText || hasActivities;
        nextState = {
          ...previous,
          turnId: null,
          status: event.status === 'failed' ? 'error' : 'ready',
          error: event.status === 'failed' ? event.error ?? previous.error : null,
          messages: shouldAddMessage
            ? [
                ...previous.messages,
                {
                  id: `${event.sessionId}:assistant:${previous.messages.length}`,
                  role: 'assistant',
                  text: previous.streamingAssistantText,
                  activities: previous.currentTurnActivities,
                },
              ]
            : previous.messages,
          streamingAssistantText: '',
          currentTurnActivities: [],
        };
        break;
      }
    }

    set(sessionStatesAtom, {
      ...current,
      [event.sessionId]: nextState,
    });
  },
);

const registerUserPromptAtom = atom(
  null,
  (get, set, input: { sessionId: string; prompt: string }) => {
    const current = get(sessionStatesAtom);
    const previous = current[input.sessionId] ?? DEFAULT_SESSION_STATE;

    set(sessionStatesAtom, {
      ...current,
      [input.sessionId]: {
        ...previous,
        status: previous.status === 'closed' ? 'connecting' : previous.status,
        messages: [
          ...previous.messages,
          {
            id: `${input.sessionId}:user:${previous.messages.length}`,
            role: 'user',
            text: input.prompt,
            activities: [],
          },
        ],
        streamingAssistantText: '',
        error: null,
      },
    });
  },
);

const removeSessionStateAtom = atom(null, (get, set, sessionId: string) => {
  const current = get(sessionStatesAtom);
  set(
    sessionStatesAtom,
    Object.fromEntries(
      Object.entries(current).filter(([currentSessionId]) => currentSessionId !== sessionId),
    ),
  );
});

const registerSessionFailureAtom = atom(
  null,
  (get, set, input: { sessionId: string; message: string }) => {
    const current = get(sessionStatesAtom);
    const previous = current[input.sessionId] ?? DEFAULT_SESSION_STATE;

    set(sessionStatesAtom, {
      ...current,
      [input.sessionId]: {
        ...previous,
        status: 'error',
        error: input.message,
      },
    });
  },
);

let isSubscribed = false;

const ensureSessionSubscription = () => {
  if (isSubscribed || typeof window === 'undefined') {
    return;
  }

  isSubscribed = true;
  window.electronAPI.onCodexSessionEvent((event) => {
    appJotaiStore.set(updateSessionEventAtom, event);
  });
};

export function useCodexSessionState(sessionId: string): CodexSessionState {
  ensureSessionSubscription();

  return useAtomValue(sessionStatesAtom)[sessionId] ?? DEFAULT_SESSION_STATE;
}

export function useCodexSessionActions() {
  ensureSessionSubscription();

  const registerUserPrompt = useSetAtom(registerUserPromptAtom);
  const registerSessionFailure = useSetAtom(registerSessionFailureAtom);
  const removeSessionState = useSetAtom(removeSessionStateAtom);

  const sendPrompt = async (sessionId: string, cwd: string, prompt: string) => {
    registerUserPrompt({ sessionId, prompt });

    try {
      await window.electronAPI.sendCodexSessionPrompt({ sessionId, cwd, prompt });
    } catch (error) {
      registerSessionFailure({
        sessionId,
        message:
          error instanceof Error ? error.message : 'Failed to start Codex session.',
      });
      throw error;
    }
  };

  const interruptSession = async (sessionId: string) => {
    await window.electronAPI.interruptCodexSession(sessionId);
  };

  const stopSession = async (sessionId: string) => {
    await window.electronAPI.stopCodexSession(sessionId);
    removeSessionState(sessionId);
  };

  const respondToApproval = async (
    sessionId: string,
    requestId: string,
    decision: CodexApprovalDecision,
  ) => {
    await window.electronAPI.respondToCodexApproval({
      sessionId,
      requestId,
      decision,
    });
  };

  const respondToUserInput = async (
    sessionId: string,
    requestId: string,
    answers: Record<string, string>,
  ) => {
    await window.electronAPI.respondToCodexUserInput({
      sessionId,
      requestId,
      answers,
    });
  };

  return {
    sendPrompt,
    interruptSession,
    stopSession,
    respondToApproval,
    respondToUserInput,
  };
}
