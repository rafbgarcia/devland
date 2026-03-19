import { useCallback } from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import type { WorkspaceSession } from '@/ipc/contracts';
import {
  areWorkspaceSessionsEqual,
  DEFAULT_WORKSPACE_SESSION,
  sanitizeWorkspaceSession,
} from '@/renderer/shared/lib/workspace-view-state';

const STORAGE_KEY = 'devland:workspace-session';

const storedWorkspaceSessionAtom = atomWithStorage<WorkspaceSession>(
  STORAGE_KEY,
  DEFAULT_WORKSPACE_SESSION,
);

export const workspaceSessionAtom = atom<WorkspaceSession>((get) =>
  sanitizeWorkspaceSession(get(storedWorkspaceSessionAtom)),
);

const updateWorkspaceSessionAtom = atom(
  null,
  (
    get,
    set,
    nextSession:
      | Partial<WorkspaceSession>
      | ((session: WorkspaceSession) => WorkspaceSession),
  ) => {
    const currentSession = get(workspaceSessionAtom);
    const resolvedSession =
      typeof nextSession === 'function'
        ? nextSession(currentSession)
        : { ...currentSession, ...nextSession };
    const sanitizedSession = sanitizeWorkspaceSession(resolvedSession);

    if (areWorkspaceSessionsEqual(currentSession, sanitizedSession)) {
      return;
    }

    set(storedWorkspaceSessionAtom, sanitizedSession);
  },
);

export function useWorkspaceSession() {
  const session = useAtomValue(workspaceSessionAtom);
  const updateSession = useSetAtom(updateWorkspaceSessionAtom);

  const setActiveRepoId = useCallback(
    (activeRepoId: string | null) => updateSession({ activeRepoId }),
    [updateSession],
  );
  return {
    session,
    updateSession,
    setActiveRepoId,
  };
}
