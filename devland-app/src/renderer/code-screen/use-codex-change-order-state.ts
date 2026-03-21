import { useCallback } from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import {
  DEFAULT_CODEX_CHANGE_ORDER_STATE,
  sanitizeCodexChangeOrderState,
  type CodexChangeOrderState,
} from '@/renderer/code-screen/codex-change-order';

type StoredCodexChangeOrderState = Record<string, Record<string, CodexChangeOrderState>>;

const STORAGE_KEY = 'devland:codex-change-order-state';

const sanitizeStoredCodexChangeOrderState = (
  value: unknown,
): StoredCodexChangeOrderState => {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([repoId, targetStates]) => {
      const normalizedRepoId = repoId.trim();

      if (
        normalizedRepoId === '' ||
        typeof targetStates !== 'object' ||
        targetStates === null
      ) {
        return [];
      }

      const sanitizedTargetStates = Object.fromEntries(
        Object.entries(targetStates as Record<string, unknown>).flatMap(([targetId, state]) => {
          const normalizedTargetId = targetId.trim();

          if (normalizedTargetId === '') {
            return [];
          }

          return [[normalizedTargetId, sanitizeCodexChangeOrderState(state)] as const];
        }),
      );

      if (Object.keys(sanitizedTargetStates).length === 0) {
        return [];
      }

      return [[normalizedRepoId, sanitizedTargetStates] as const];
    }),
  );
};

const storedCodexChangeOrderStateAtom = atomWithStorage<StoredCodexChangeOrderState>(
  STORAGE_KEY,
  {},
);

const codexChangeOrderStateAtom = atom<StoredCodexChangeOrderState>((get) =>
  sanitizeStoredCodexChangeOrderState(get(storedCodexChangeOrderStateAtom)),
);

const areCodexChangeOrderStatesEqual = (
  left: CodexChangeOrderState,
  right: CodexChangeOrderState,
): boolean =>
  left.sortMode === right.sortMode &&
  left.nextSequence === right.nextSequence &&
  Object.keys(left.touchSequenceByPath).length === Object.keys(right.touchSequenceByPath).length &&
  Object.entries(left.touchSequenceByPath).every(
    ([path, sequence]) => right.touchSequenceByPath[path] === sequence,
  );

const isDefaultCodexChangeOrderState = (state: CodexChangeOrderState): boolean =>
  areCodexChangeOrderStatesEqual(state, DEFAULT_CODEX_CHANGE_ORDER_STATE);

const updateCodexChangeOrderStateAtom = atom(
  null,
  (
    get,
    set,
    input:
      | {
          type: 'update-target';
          repoId: string;
          targetId: string;
          updater: (state: CodexChangeOrderState) => CodexChangeOrderState;
        }
      | {
          type: 'prune-targets';
          repoId: string;
          targetIds: readonly string[];
        },
  ) => {
    const current = get(codexChangeOrderStateAtom);

    if (input.type === 'update-target') {
      const repoStates = current[input.repoId] ?? {};
      const previousState = sanitizeCodexChangeOrderState(repoStates[input.targetId]);
      const nextState = sanitizeCodexChangeOrderState(input.updater(previousState));

      if (areCodexChangeOrderStatesEqual(previousState, nextState)) {
        return;
      }

      const nextRepoStates = isDefaultCodexChangeOrderState(nextState)
        ? Object.fromEntries(
            Object.entries(repoStates).filter(([targetId]) => targetId !== input.targetId),
          )
        : {
            ...repoStates,
            [input.targetId]: nextState,
          };
      const nextStoredState =
        Object.keys(nextRepoStates).length === 0
          ? Object.fromEntries(
              Object.entries(current).filter(([repoId]) => repoId !== input.repoId),
            )
          : {
              ...current,
              [input.repoId]: nextRepoStates,
            };

      set(
        storedCodexChangeOrderStateAtom,
        sanitizeStoredCodexChangeOrderState(nextStoredState),
      );
      return;
    }

    const targetIdSet = new Set(input.targetIds.map((targetId) => targetId.trim()).filter(Boolean));
    const currentRepoStates = current[input.repoId] ?? {};
    const nextRepoStates = Object.fromEntries(
      Object.entries(currentRepoStates).filter(([targetId]) => targetIdSet.has(targetId)),
    );

    if (
      Object.keys(currentRepoStates).length === Object.keys(nextRepoStates).length &&
      Object.keys(currentRepoStates).every((targetId) => targetId in nextRepoStates)
    ) {
      return;
    }

    const nextStoredState =
      Object.keys(nextRepoStates).length === 0
        ? Object.fromEntries(
            Object.entries(current).filter(([repoId]) => repoId !== input.repoId),
          )
        : {
            ...current,
            [input.repoId]: nextRepoStates,
          };

    set(storedCodexChangeOrderStateAtom, sanitizeStoredCodexChangeOrderState(nextStoredState));
  },
);

export function useRepoCodexChangeOrderState(repoId: string) {
  const stateByRepo = useAtomValue(codexChangeOrderStateAtom);
  const updateCodexChangeOrderState = useSetAtom(updateCodexChangeOrderStateAtom);

  const statesByTargetId = stateByRepo[repoId] ?? {};

  const updateTargetState = useCallback((
    targetId: string,
    updater: (state: CodexChangeOrderState) => CodexChangeOrderState,
  ) => {
    updateCodexChangeOrderState({
      type: 'update-target',
      repoId,
      targetId,
      updater,
    });
  }, [repoId, updateCodexChangeOrderState]);

  const pruneTargetStates = useCallback((targetIds: readonly string[]) => {
    updateCodexChangeOrderState({
      type: 'prune-targets',
      repoId,
      targetIds,
    });
  }, [repoId, updateCodexChangeOrderState]);

  return {
    statesByTargetId,
    updateTargetState,
    pruneTargetStates,
  };
}
