import { useCallback, useMemo } from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import type { CodeTarget } from '@/ipc/contracts';
import { CodeTargetSchema } from '@/ipc/contracts';

type StoredCodeTargets = Record<string, CodeTarget[]>;
type StoredActiveTargetIds = Record<string, string>;

const CODE_TARGETS_STORAGE_KEY = 'devland:code-targets';
const ACTIVE_CODE_TARGET_STORAGE_KEY = 'devland:active-code-targets';

const sanitizeStoredCodeTargets = (value: unknown): StoredCodeTargets => {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  const next: StoredCodeTargets = {};

  for (const [repoId, candidates] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(candidates)) {
      continue;
    }

    const parsedTargets = candidates.flatMap((candidate) => {
      const parsed = CodeTargetSchema.safeParse(candidate);

      return parsed.success && parsed.data.kind !== 'root' ? [parsed.data] : [];
    });

    if (parsedTargets.length > 0) {
      next[repoId] = parsedTargets;
    }
  }

  return next;
};

const sanitizeStoredActiveTargetIds = (value: unknown): StoredActiveTargetIds => {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([repoId, targetId]) =>
      typeof targetId === 'string' && targetId.trim() !== ''
        ? [[repoId, targetId]]
        : [],
    ),
  );
};

const storedCodeTargetsAtom = atomWithStorage<StoredCodeTargets>(
  CODE_TARGETS_STORAGE_KEY,
  {},
);
const storedActiveTargetIdsAtom = atomWithStorage<StoredActiveTargetIds>(
  ACTIVE_CODE_TARGET_STORAGE_KEY,
  {},
);

const codeTargetsAtom = atom<StoredCodeTargets>((get) =>
  sanitizeStoredCodeTargets(get(storedCodeTargetsAtom)),
);
const activeTargetIdsAtom = atom<StoredActiveTargetIds>((get) =>
  sanitizeStoredActiveTargetIds(get(storedActiveTargetIdsAtom)),
);

const updateCodeTargetsAtom = atom(
  null,
  (
    get,
    set,
    nextValue: StoredCodeTargets | ((current: StoredCodeTargets) => StoredCodeTargets),
  ) => {
    const current = get(codeTargetsAtom);
    const resolved = typeof nextValue === 'function' ? nextValue(current) : nextValue;
    set(storedCodeTargetsAtom, sanitizeStoredCodeTargets(resolved));
  },
);

const updateActiveTargetIdsAtom = atom(
  null,
  (
    get,
    set,
    nextValue:
      | StoredActiveTargetIds
      | ((current: StoredActiveTargetIds) => StoredActiveTargetIds),
  ) => {
    const current = get(activeTargetIdsAtom);
    const resolved = typeof nextValue === 'function' ? nextValue(current) : nextValue;
    set(storedActiveTargetIdsAtom, sanitizeStoredActiveTargetIds(resolved));
  },
);

const createCodeTarget = (
  repoId: string,
  kind: CodeTarget['kind'],
  cwd: string,
  title: string,
): CodeTarget => ({
  id: crypto.randomUUID(),
  repoId,
  kind,
  cwd,
  title,
  createdAt: new Date().toISOString(),
});

export function useCodeTargets(repoId: string, repoPath: string) {
  const storedTargets = useAtomValue(codeTargetsAtom);
  const activeTargetIds = useAtomValue(activeTargetIdsAtom);
  const updateCodeTargets = useSetAtom(updateCodeTargetsAtom);
  const updateActiveTargetIds = useSetAtom(updateActiveTargetIdsAtom);

  const rootTarget = useMemo<CodeTarget>(
    () => ({
      id: `${repoId}:root`,
      repoId,
      kind: 'root',
      cwd: repoPath,
      title: 'Current branch',
      createdAt: repoId,
    }),
    [repoId, repoPath],
  );

  const storedTargetsForRepo = storedTargets[repoId] ?? [];
  const targets = useMemo(
    () => [rootTarget, ...storedTargetsForRepo],
    [rootTarget, storedTargetsForRepo],
  );

  const activeTargetId = useMemo(() => {
    const preferred = activeTargetIds[repoId];

    return targets.some((target) => target.id === preferred)
      ? preferred
      : rootTarget.id;
  }, [activeTargetIds, repoId, rootTarget.id, targets]);

  const activeTarget =
    targets.find((target) => target.id === activeTargetId) ?? rootTarget;

  const setActiveTarget = useCallback(
    (targetId: string) => {
      updateActiveTargetIds((current) => ({ ...current, [repoId]: targetId }));
    },
    [repoId, updateActiveTargetIds],
  );

  const addCurrentBranchSession = useCallback(() => {
    const sessionCount =
      1 +
      storedTargetsForRepo.filter((target) => target.kind === 'session').length;
    const target = createCodeTarget(
      repoId,
      'session',
      repoPath,
      `Session ${sessionCount}`,
    );

    updateCodeTargets((current) => ({
      ...current,
      [repoId]: [...(current[repoId] ?? []), target],
    }));
    updateActiveTargetIds((current) => ({ ...current, [repoId]: target.id }));

    return target;
  }, [
    repoId,
    repoPath,
    storedTargetsForRepo,
    updateActiveTargetIds,
    updateCodeTargets,
  ]);

  const addWorktreeTarget = useCallback(
    (cwd: string, branch: string) => {
      const target = createCodeTarget(repoId, 'worktree', cwd, branch);

      updateCodeTargets((current) => ({
        ...current,
        [repoId]: [...(current[repoId] ?? []), target],
      }));
      updateActiveTargetIds((current) => ({ ...current, [repoId]: target.id }));

      return target;
    },
    [repoId, updateActiveTargetIds, updateCodeTargets],
  );

  const removeTarget = useCallback(
    (targetId: string) => {
      updateCodeTargets((current) => {
        const nextTargets = (current[repoId] ?? []).filter(
          (target) => target.id !== targetId,
        );

        return nextTargets.length > 0
          ? { ...current, [repoId]: nextTargets }
          : Object.fromEntries(
              Object.entries(current).filter(([currentRepoId]) => currentRepoId !== repoId),
            );
      });
      updateActiveTargetIds((current) => ({
        ...current,
        [repoId]: current[repoId] === targetId ? rootTarget.id : current[repoId] ?? rootTarget.id,
      }));
    },
    [repoId, rootTarget.id, updateActiveTargetIds, updateCodeTargets],
  );

  const updateTarget = useCallback(
    (targetId: string, updater: (target: CodeTarget) => CodeTarget) => {
      updateCodeTargets((current) => {
        const targetsForRepo = current[repoId] ?? [];
        const nextTargets = targetsForRepo.map((target) =>
          target.id === targetId ? updater(target) : target,
        );

        return { ...current, [repoId]: nextTargets };
      });
    },
    [repoId, updateCodeTargets],
  );

  return {
    targets,
    activeTarget,
    activeTargetId,
    setActiveTarget,
    addCurrentBranchSession,
    addWorktreeTarget,
    removeTarget,
    updateTarget,
  };
}
