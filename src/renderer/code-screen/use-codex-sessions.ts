import { atom, useAtomValue, useSetAtom } from 'jotai';
import type { Getter, Setter } from 'jotai/vanilla';
import { atomWithStorage, selectAtom } from 'jotai/utils';

import type {
  CodexApprovalDecision,
  CodexSessionEvent,
} from '@/ipc/contracts';
import {
  applyCodexSessionEvent,
  hydrateCodexSessionState,
  toCodexSessionSnapshot,
  type CodexSessionSnapshot,
  type CodexSessionState,
} from '@/renderer/code-screen/codex-session-state';
import { buildSessionHistoryBootstrap } from '@/renderer/code-screen/session-history-bootstrap';
import { appJotaiStore } from '@/renderer/shared/lib/jotai-store';

const SESSION_SNAPSHOTS_STORAGE_KEY = 'devland:codex-session-snapshots';

const sessionStatesAtom = atom<Record<string, CodexSessionState>>({});
const persistedSessionSnapshotsAtom = atomWithStorage<Record<string, CodexSessionSnapshot>>(
  SESSION_SNAPSHOTS_STORAGE_KEY,
  {},
);
const sessionStateSourceAtom = atom((get) => ({
  liveStates: get(sessionStatesAtom),
  persistedSnapshots: get(persistedSessionSnapshotsAtom),
}));
function createSessionStateAtom(sessionId: string) {
  return selectAtom(sessionStateSourceAtom, ({ liveStates, persistedSnapshots }) =>
    readSessionState(liveStates, persistedSnapshots, sessionId),
  );
}

const sessionStateAtoms = new Map<string, ReturnType<typeof createSessionStateAtom>>();

function readSessionState(
  liveStates: Record<string, CodexSessionState>,
  persistedSnapshots: Record<string, CodexSessionSnapshot>,
  sessionId: string,
): CodexSessionState {
  return liveStates[sessionId] ?? hydrateCodexSessionState(persistedSnapshots[sessionId] ?? null);
}

function getSessionState(get: Getter, sessionId: string) {
  return readSessionState(get(sessionStatesAtom), get(persistedSessionSnapshotsAtom), sessionId);
}

function writeSessionState(
  get: Getter,
  set: Setter,
  sessionId: string,
  nextState: CodexSessionState,
) {
  const currentStates = get(sessionStatesAtom);
  const currentSnapshots = get(persistedSessionSnapshotsAtom);
  const nextSnapshot = toCodexSessionSnapshot(nextState);
  const remainingSnapshots = Object.fromEntries(
    Object.entries(currentSnapshots).filter(([currentSessionId]) => currentSessionId !== sessionId),
  );

  set(sessionStatesAtom, {
    ...currentStates,
    [sessionId]: nextState,
  });
  set(
    persistedSessionSnapshotsAtom,
    nextSnapshot === null
      ? remainingSnapshots
      : {
          ...remainingSnapshots,
          [sessionId]: nextSnapshot,
        },
  );
}

function getSessionStateAtom(sessionId: string) {
  const existingAtom = sessionStateAtoms.get(sessionId);

  if (existingAtom) {
    return existingAtom;
  }

  const nextAtom = createSessionStateAtom(sessionId);
  sessionStateAtoms.set(sessionId, nextAtom);

  return nextAtom;
}

const updateSessionEventAtom = atom(
  null,
  (get, set, event: CodexSessionEvent) => {
    const previous = getSessionState(get, event.sessionId);
    const nextState = applyCodexSessionEvent(previous, event);

    writeSessionState(get, set, event.sessionId, nextState);
  },
);

const registerUserPromptAtom = atom(
  null,
  (get, set, input: { sessionId: string; prompt: string }) => {
    const previous = getSessionState(get, input.sessionId);

    writeSessionState(get, set, input.sessionId, {
      ...previous,
      status: previous.status === 'closed' ? 'connecting' : previous.status,
      messages: [
        ...previous.messages,
        {
          id: `${input.sessionId}:user:${previous.messages.length}`,
          role: 'user',
          text: input.prompt,
          createdAt: new Date().toISOString(),
          completedAt: null,
          turnId: null,
          diff: null,
          activities: [],
        },
      ],
      streamingAssistantText: '',
      error: null,
    });
  },
);

const removeSessionStateAtom = atom(null, (get, set, sessionId: string) => {
  const currentStates = get(sessionStatesAtom);
  const currentSnapshots = get(persistedSessionSnapshotsAtom);
  sessionStateAtoms.delete(sessionId);

  set(
    sessionStatesAtom,
    Object.fromEntries(
      Object.entries(currentStates).filter(([currentSessionId]) => currentSessionId !== sessionId),
    ),
  );
  set(
    persistedSessionSnapshotsAtom,
    Object.fromEntries(
      Object.entries(currentSnapshots).filter(([currentSessionId]) => currentSessionId !== sessionId),
    ),
  );
});

const registerSessionFailureAtom = atom(
  null,
  (get, set, input: { sessionId: string; message: string }) => {
    const previous = getSessionState(get, input.sessionId);

    writeSessionState(get, set, input.sessionId, {
      ...previous,
      status: 'error',
      error: input.message,
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

  return useAtomValue(getSessionStateAtom(sessionId));
}

export function useCodexSessionActions() {
  ensureSessionSubscription();

  const registerUserPrompt = useSetAtom(registerUserPromptAtom);
  const registerSessionFailure = useSetAtom(registerSessionFailureAtom);
  const removeSessionState = useSetAtom(removeSessionStateAtom);

  const sendPrompt = async (sessionId: string, cwd: string, prompt: string) => {
    const previous = appJotaiStore.get(getSessionStateAtom(sessionId));
    const transcriptBootstrap =
      previous.threadId && previous.messages.length > 0
        ? buildSessionHistoryBootstrap(previous.messages, prompt, 120_000)
        : null;

    registerUserPrompt({ sessionId, prompt });

    try {
      await window.electronAPI.sendCodexSessionPrompt({
        sessionId,
        cwd,
        prompt,
        resumeThreadId: previous.threadId,
        transcriptBootstrap,
      });
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
