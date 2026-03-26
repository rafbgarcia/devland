import { atom, useAtomValue, useSetAtom } from 'jotai';
import type { Getter, Setter } from 'jotai/vanilla';
import { atomWithStorage, selectAtom } from 'jotai/utils';

import type {
  CodexApprovalDecision,
  CodexResumedThread,
  CodexSessionEvent,
} from '@/ipc/contracts';
import type {
  CodexComposerSettings,
  CodexChatImageAttachment,
  CodexPromptAttachment,
  CodexPromptSubmission,
} from '@/lib/codex-chat';
import {
  applyCodexSessionEvent,
  DEFAULT_SESSION_STATE,
  hydrateResumedCodexThreadState,
  hydrateCodexSessionState,
  toCodexSessionSnapshot,
  type CodexSessionSnapshot,
  type CodexSessionState,
} from '@/renderer/code-screen/codex-session-state';
import { buildSessionHistoryBootstrap } from '@/renderer/code-screen/session-history-bootstrap';
import { appJotaiStore } from '@/renderer/shared/lib/jotai-store';

const SESSION_SNAPSHOTS_STORAGE_KEY = 'devland:codex-session-snapshots';
const MAX_PERSISTED_SESSION_SNAPSHOTS = 16;

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
const pendingPromptChains = new Map<string, Promise<void>>();

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

function toPersistedChatAttachments(
  attachments: ReadonlyArray<CodexPromptAttachment>,
): CodexChatImageAttachment[] {
  return attachments.map((attachment) => ({
    type: attachment.type,
    name: attachment.name,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    previewUrl: attachment.previewUrl,
  }));
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
    pruneSessionSnapshots(
      nextSnapshot === null
        ? remainingSnapshots
        : {
            ...remainingSnapshots,
            [sessionId]: nextSnapshot,
          },
    ),
  );
}

function pruneSessionSnapshots(
  snapshots: Record<string, CodexSessionSnapshot>,
): Record<string, CodexSessionSnapshot> {
  const entries = Object.entries(snapshots);

  if (entries.length <= MAX_PERSISTED_SESSION_SNAPSHOTS) {
    return snapshots;
  }

  return Object.fromEntries(
    entries
      .sort((left, right) => right[1].updatedAt.localeCompare(left[1].updatedAt))
      .slice(0, MAX_PERSISTED_SESSION_SNAPSHOTS),
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
  (get, set, input: { sessionId: string; prompt: string; attachments: CodexChatImageAttachment[] }) => {
    const previous = getSessionState(get, input.sessionId);
    const messageId = `${input.sessionId}:user:${previous.messages.length}`;
    const createdAt = new Date().toISOString();

    writeSessionState(get, set, input.sessionId, {
      ...previous,
      status: previous.status === 'closed' ? 'connecting' : previous.status,
      transcriptEntries: [
        ...previous.transcriptEntries,
        {
          id: messageId,
          kind: 'message',
          message: {
            id: messageId,
            role: 'user',
            text: input.prompt,
            attachments: input.attachments,
            createdAt,
            completedAt: null,
            turnId: null,
            itemId: null,
            diff: null,
            activities: [],
          },
        },
      ],
      messages: [
        ...previous.messages,
        {
          id: messageId,
          role: 'user',
          text: input.prompt,
          attachments: input.attachments,
          createdAt,
          completedAt: null,
          turnId: null,
          itemId: null,
          diff: null,
          activities: [],
        },
      ],
      error: null,
    });
  },
);

const resetSessionStateAtom = atom(null, (get, set, sessionId: string) => {
  const previous = getSessionState(get, sessionId);

  writeSessionState(get, set, sessionId, {
    ...DEFAULT_SESSION_STATE,
    messages: previous.messages,
  });
});

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

const restoreResumedThreadAtom = atom(
  null,
  (get, set, input: { sessionId: string; thread: CodexResumedThread }) => {
    const previous = getSessionState(get, input.sessionId);
    const resumedState = hydrateResumedCodexThreadState(input.thread);

    writeSessionState(get, set, input.sessionId, {
      ...resumedState,
      tokenUsage:
        previous.threadId === input.thread.threadId
          ? previous.tokenUsage
          : null,
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

export function getCodexSessionStateSnapshot(sessionId: string): CodexSessionState {
  ensureSessionSubscription();

  return appJotaiStore.get(getSessionStateAtom(sessionId));
}

export function useCodexSessionMetadataMap(
  sessionIds: readonly string[],
): Record<string, Pick<CodexSessionState, 'threadId' | 'threadName'>> {
  ensureSessionSubscription();

  const source = useAtomValue(sessionStateSourceAtom);

  return Object.fromEntries(
    sessionIds.map((sessionId) => {
      const state = readSessionState(source.liveStates, source.persistedSnapshots, sessionId);

      return [
        sessionId,
        {
          threadId: state.threadId,
          threadName: state.threadName,
        },
      ];
    }),
  );
}

export function useCodexSessionActions() {
  ensureSessionSubscription();

  const registerUserPrompt = useSetAtom(registerUserPromptAtom);
  const registerSessionFailure = useSetAtom(registerSessionFailureAtom);
  const removeSessionState = useSetAtom(removeSessionStateAtom);
  const resetSessionState = useSetAtom(resetSessionStateAtom);
  const restoreResumedThread = useSetAtom(restoreResumedThreadAtom);

  const sendPrompt = async (
    sessionId: string,
    cwd: string,
    submission: CodexPromptSubmission,
    options?: {
      beforeSend?: () => Promise<void>;
      background?: boolean;
      browserControlEnabled?: boolean;
      threadName?: string | null;
    },
  ) => {
    const previous = appJotaiStore.get(getSessionStateAtom(sessionId));
    const persistedAttachments =
      submission.persistedAttachments
        ?? toPersistedChatAttachments(submission.attachments);
    const transcriptBootstrap =
      previous.threadId && previous.messages.length > 0
        ? buildSessionHistoryBootstrap(
            previous.messages,
            {
              text: submission.prompt,
              attachments: submission.attachments.map((attachment) => ({
                type: attachment.type,
                name: attachment.name,
                mimeType: attachment.mimeType,
                sizeBytes: attachment.sizeBytes,
                previewUrl: null,
              })),
            },
            120_000,
          )
        : null;

    const previousChain = pendingPromptChains.get(sessionId) ?? Promise.resolve();
    const nextChain = previousChain
      .catch(() => {})
      .then(async () => {
        try {
          await options?.beforeSend?.();
          registerUserPrompt({
            sessionId,
            prompt: submission.prompt,
            attachments: persistedAttachments,
          });
          await window.electronAPI.sendCodexSessionPrompt({
            sessionId,
            cwd,
            prompt: submission.prompt,
            settings: submission.settings,
            browserControlEnabled: options?.browserControlEnabled ?? false,
            attachments: submission.attachments,
            persistedAttachments,
            resumeThreadId: previous.threadId,
            threadName: options?.threadName ?? null,
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
      })
      .finally(() => {
        if (pendingPromptChains.get(sessionId) === nextChain) {
          pendingPromptChains.delete(sessionId);
        }
      });

    pendingPromptChains.set(sessionId, nextChain);

    if (options?.background) {
      void nextChain.catch(() => {});
      return;
    }

    await nextChain;
  };

  const setThreadName = async (sessionId: string, threadName: string) => {
    await window.electronAPI.setCodexSessionThreadName({
      sessionId,
      threadName,
    });
  };

  const interruptSession = async (sessionId: string) => {
    await window.electronAPI.interruptCodexSession(sessionId);
  };

  const stopSession = async (sessionId: string) => {
    pendingPromptChains.delete(sessionId);
    await window.electronAPI.stopCodexSession(sessionId);
    removeSessionState(sessionId);
  };

  const resetSession = async (sessionId: string) => {
    pendingPromptChains.delete(sessionId);
    await window.electronAPI.stopCodexSession(sessionId);
    resetSessionState(sessionId);
  };

  const resumeThread = async (
    sessionId: string,
    cwd: string,
    settings: CodexComposerSettings,
    threadId: string,
    browserControlEnabled = false,
  ) => {
    const resumedThread = await window.electronAPI.resumeCodexThread({
      sessionId,
      cwd,
      settings,
      threadId,
      browserControlEnabled,
    });

    restoreResumedThread({
      sessionId,
      thread: resumedThread,
    });
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
    setThreadName,
    interruptSession,
    stopSession,
    resetSession,
    resumeThread,
    respondToApproval,
    respondToUserInput,
  };
}
