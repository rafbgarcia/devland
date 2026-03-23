import {
  CODE_WORKSPACE_PANES,
  type AppShortcutDirection,
  type CodeTarget,
  type CodeWorkspacePane,
} from '@/ipc/contracts';

export const getRootCodeTargetId = (repoId: string): string => `${repoId}:root`;

export const isRootCodeTargetId = (
  repoId: string,
  targetId: string | null,
): boolean => targetId === null || targetId === getRootCodeTargetId(repoId);

export const getAdjacentCodePaneId = (
  activePaneId: CodeWorkspacePane,
  direction: AppShortcutDirection,
): CodeWorkspacePane => {
  const activePaneIndex = CODE_WORKSPACE_PANES.indexOf(activePaneId);
  const currentIndex = activePaneIndex === -1 ? 0 : activePaneIndex;
  const adjacentPaneIndex = direction === 'next'
    ? (currentIndex + 1) % CODE_WORKSPACE_PANES.length
    : (currentIndex - 1 + CODE_WORKSPACE_PANES.length) % CODE_WORKSPACE_PANES.length;

  return CODE_WORKSPACE_PANES[adjacentPaneIndex] ?? CODE_WORKSPACE_PANES[0];
};

export const getAdjacentCodeTargetId = (
  targets: CodeTarget[],
  activeTargetId: string | null,
  direction: AppShortcutDirection,
): string | null => {
  if (targets.length === 0) {
    return null;
  }

  const activeTargetIndex = activeTargetId === null
    ? -1
    : targets.findIndex((target) => target.id === activeTargetId);

  if (activeTargetIndex === -1) {
    return direction === 'previous'
      ? (targets.at(-1)?.id ?? null)
      : (targets[0]?.id ?? null);
  }

  const adjacentTargetIndex = direction === 'next'
    ? (activeTargetIndex + 1) % targets.length
    : (activeTargetIndex - 1 + targets.length) % targets.length;

  return targets[adjacentTargetIndex]?.id ?? null;
};

export const getCodeTargetIdAfterClose = (
  targets: CodeTarget[],
  closingTargetId: string | null,
): string | null => {
  if (targets.length === 0 || closingTargetId === null) {
    return null;
  }

  const closingTargetIndex = targets.findIndex((target) => target.id === closingTargetId);

  if (closingTargetIndex === -1) {
    return null;
  }

  const remainingTargets = targets.filter((target) => target.id !== closingTargetId);

  return (
    remainingTargets[closingTargetIndex]?.id ??
    remainingTargets[closingTargetIndex - 1]?.id ??
    null
  );
};
