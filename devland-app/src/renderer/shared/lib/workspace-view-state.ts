import {
  DEFAULT_CODE_WORKSPACE_PANE,
  DEFAULT_PROJECT_VIEW_TAB,
  type CodeWorkspacePane,
  type RepoWorkspaceState,
  type WorkspaceSession,
} from '@/ipc/contracts';
import { resolveProjectTabId, type ProjectTabId } from '@/renderer/shared/lib/projects';

export const DEFAULT_REPO_WORKSPACE_STATE: RepoWorkspaceState = {
  activeTabId: DEFAULT_PROJECT_VIEW_TAB,
  activeCodeTargetId: null,
  activeCodePaneId: DEFAULT_CODE_WORKSPACE_PANE,
};

export const DEFAULT_WORKSPACE_SESSION: WorkspaceSession = {
  activeRepoId: null,
  repoViewById: {},
};

const areRepoWorkspaceStatesEqual = (
  left: RepoWorkspaceState,
  right: RepoWorkspaceState,
): boolean =>
  left.activeTabId === right.activeTabId &&
  left.activeCodeTargetId === right.activeCodeTargetId &&
  left.activeCodePaneId === right.activeCodePaneId;

const sanitizeRepoWorkspaceState = (value: unknown): RepoWorkspaceState => {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_REPO_WORKSPACE_STATE;
  }

  const record = value as Record<string, unknown>;
  const activeCodeTargetId =
    typeof record.activeCodeTargetId === 'string' && record.activeCodeTargetId.trim() !== ''
      ? record.activeCodeTargetId
      : null;

  return {
    activeTabId: resolveProjectTabId(
      typeof record.activeTabId === 'string' ? record.activeTabId : null,
    ),
    activeCodeTargetId,
    activeCodePaneId:
      record.activeCodePaneId === 'changes' ||
      record.activeCodePaneId === 'codex' ||
      record.activeCodePaneId === 'browser' ||
      record.activeCodePaneId === 'terminal'
        ? record.activeCodePaneId
        : DEFAULT_CODE_WORKSPACE_PANE,
  };
};

const updateRepoWorkspaceState = (
  session: WorkspaceSession,
  repoId: string,
  updater: (state: RepoWorkspaceState) => RepoWorkspaceState,
): WorkspaceSession => {
  const currentRepoState = getRepoWorkspaceState(session, repoId);
  const nextRepoState = updater(currentRepoState);
  const repoViewById = areRepoWorkspaceStatesEqual(currentRepoState, nextRepoState)
    ? session.repoViewById
    : {
        ...session.repoViewById,
        [repoId]: nextRepoState,
      };
  const activeRepoId = session.activeRepoId === repoId ? session.activeRepoId : repoId;

  if (repoViewById === session.repoViewById && activeRepoId === session.activeRepoId) {
    return session;
  }

  return {
    activeRepoId,
    repoViewById,
  };
};

export const getRepoWorkspaceState = (
  session: WorkspaceSession,
  repoId: string,
): RepoWorkspaceState =>
  sanitizeRepoWorkspaceState(session.repoViewById[repoId]);

export const getRememberedProjectTabId = (
  session: WorkspaceSession,
  repoId: string,
  fallbackTabId: ProjectTabId = DEFAULT_PROJECT_VIEW_TAB,
): ProjectTabId =>
  resolveProjectTabId(getRepoWorkspaceState(session, repoId).activeTabId, fallbackTabId);

export const getRememberedCodeTargetId = (
  session: WorkspaceSession,
  repoId: string,
): string | null => getRepoWorkspaceState(session, repoId).activeCodeTargetId;

export const getRememberedCodePaneId = (
  session: WorkspaceSession,
  repoId: string,
): CodeWorkspacePane => getRepoWorkspaceState(session, repoId).activeCodePaneId;

export const rememberProjectTab = (
  session: WorkspaceSession,
  repoId: string,
  tabId: ProjectTabId,
): WorkspaceSession =>
  updateRepoWorkspaceState(session, repoId, (state) => {
    const activeTabId = resolveProjectTabId(tabId, DEFAULT_PROJECT_VIEW_TAB);

    return state.activeTabId === activeTabId ? state : { ...state, activeTabId };
  });

export const rememberCodeTarget = (
  session: WorkspaceSession,
  repoId: string,
  targetId: string | null,
): WorkspaceSession =>
  updateRepoWorkspaceState(session, repoId, (state) => {
    const activeCodeTargetId =
      typeof targetId === 'string' && targetId.trim() !== '' ? targetId : null;

    return state.activeCodeTargetId === activeCodeTargetId
      ? state
      : { ...state, activeCodeTargetId };
  });

export const rememberCodePane = (
  session: WorkspaceSession,
  repoId: string,
  paneId: CodeWorkspacePane,
): WorkspaceSession =>
  updateRepoWorkspaceState(session, repoId, (state) =>
    state.activeCodePaneId === paneId ? state : { ...state, activeCodePaneId: paneId },
  );

export const areWorkspaceSessionsEqual = (
  left: WorkspaceSession,
  right: WorkspaceSession,
): boolean => {
  if (left.activeRepoId !== right.activeRepoId) {
    return false;
  }

  const leftEntries = Object.entries(left.repoViewById);
  const rightEntries = Object.entries(right.repoViewById);

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([repoId, state]) =>
    areRepoWorkspaceStatesEqual(
      sanitizeRepoWorkspaceState(state),
      sanitizeRepoWorkspaceState(right.repoViewById[repoId]),
    ),
  );
};

export const sanitizeWorkspaceSession = (value: unknown): WorkspaceSession => {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_WORKSPACE_SESSION;
  }

  const record = value as Record<string, unknown>;
  const activeRepoId =
    typeof record.activeRepoId === 'string' && record.activeRepoId.trim() !== ''
      ? record.activeRepoId
      : null;
  const repoViewByIdSource =
    typeof record.repoViewById === 'object' && record.repoViewById !== null
      ? (record.repoViewById as Record<string, unknown>)
      : null;

  if (repoViewByIdSource === null) {
    return {
      activeRepoId,
      repoViewById: {},
    };
  }

  const repoViewById = Object.fromEntries(
    Object.entries(repoViewByIdSource).flatMap(([repoId, repoViewState]) => {
      const normalizedRepoId = repoId.trim();

      if (normalizedRepoId === '') {
        return [];
      }

      return [[normalizedRepoId, sanitizeRepoWorkspaceState(repoViewState)]];
    }),
  );

  return {
    activeRepoId,
    repoViewById,
  };
};
