import { useCallback } from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import type { ProjectViewTab, WorkspaceSession } from '@/ipc/contracts';
import {
  DEFAULT_WORKSPACE_SESSION,
  sanitizeWorkspaceSession,
} from '@/renderer/shared/lib/projects';

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

    set(storedWorkspaceSessionAtom, sanitizeWorkspaceSession(resolvedSession));
  },
);

export function useWorkspaceSession() {
  const session = useAtomValue(workspaceSessionAtom);
  const updateSession = useSetAtom(updateWorkspaceSessionAtom);

  const setActiveRepoId = useCallback(
    (activeRepoId: string | null) => updateSession({ activeRepoId }),
    [updateSession],
  );

  const setActiveTab = useCallback(
    (activeTab: ProjectViewTab) => updateSession({ activeTab }),
    [updateSession],
  );

  return {
    session,
    updateSession,
    setActiveRepoId,
    setActiveTab,
  };
}
