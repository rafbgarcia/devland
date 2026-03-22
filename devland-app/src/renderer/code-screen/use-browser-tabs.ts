import { useCallback } from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type BrowserTab = {
  id: string;
};

type TargetBrowserTabsState = {
  activeTabId: string;
  tabs: BrowserTab[];
};

type StoredBrowserTabsState = Record<string, Record<string, TargetBrowserTabsState>>;

type UpdateTargetInput = {
  type: 'update-target';
  repoId: string;
  targetId: string;
  updater: (state: TargetBrowserTabsState) => TargetBrowserTabsState;
};

type RemoveTargetInput = {
  type: 'remove-target';
  repoId: string;
  targetId: string;
};

type PruneTargetsInput = {
  type: 'prune-targets';
  repoId: string;
  targetIds: readonly string[];
};

type StoredBrowserTabsAction =
  | UpdateTargetInput
  | RemoveTargetInput
  | PruneTargetsInput;

const STORAGE_KEY = 'devland:browser-tabs';

export const getDefaultBrowserTabId = (targetId: string): string =>
  `${targetId}:browser:1`;

export const createDefaultTargetBrowserTabsState = (
  targetId: string,
): TargetBrowserTabsState => ({
  activeTabId: getDefaultBrowserTabId(targetId),
  tabs: [{ id: getDefaultBrowserTabId(targetId) }],
});

const sanitizeBrowserTab = (value: unknown): BrowserTab | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id =
    typeof record.id === 'string' && record.id.trim() !== ''
      ? record.id
      : null;

  return id === null ? null : { id };
};

const sanitizeTargetBrowserTabsState = (
  targetId: string,
  value: unknown,
): TargetBrowserTabsState => {
  const fallbackState = createDefaultTargetBrowserTabsState(targetId);

  if (typeof value !== 'object' || value === null) {
    return fallbackState;
  }

  const record = value as Record<string, unknown>;
  const tabs = Array.isArray(record.tabs)
    ? record.tabs.flatMap((candidate) => {
        const tab = sanitizeBrowserTab(candidate);

        return tab === null ? [] : [tab];
      })
    : [];

  if (tabs.length === 0) {
    return fallbackState;
  }

  const activeTabId =
    typeof record.activeTabId === 'string' &&
    tabs.some((tab) => tab.id === record.activeTabId)
      ? record.activeTabId
      : tabs[0]?.id ?? fallbackState.activeTabId;

  return {
    activeTabId,
    tabs,
  };
};

export const sanitizeStoredBrowserTabsState = (
  value: unknown,
): StoredBrowserTabsState => {
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

          return [[
            normalizedTargetId,
            sanitizeTargetBrowserTabsState(normalizedTargetId, state),
          ] as const];
        }),
      );

      if (Object.keys(sanitizedTargetStates).length === 0) {
        return [];
      }

      return [[normalizedRepoId, sanitizedTargetStates] as const];
    }),
  );
};

const areTargetBrowserTabsEqual = (
  left: TargetBrowserTabsState,
  right: TargetBrowserTabsState,
): boolean =>
  left.activeTabId === right.activeTabId &&
  left.tabs.length === right.tabs.length &&
  left.tabs.every((tab, index) => right.tabs[index]?.id === tab.id);

const isDefaultTargetBrowserTabsState = (
  targetId: string,
  state: TargetBrowserTabsState,
): boolean =>
  areTargetBrowserTabsEqual(state, createDefaultTargetBrowserTabsState(targetId));

const withUpdatedRepoState = (
  current: StoredBrowserTabsState,
  repoId: string,
  nextRepoState: Record<string, TargetBrowserTabsState>,
): StoredBrowserTabsState =>
  Object.keys(nextRepoState).length === 0
    ? Object.fromEntries(
        Object.entries(current).filter(([candidateRepoId]) => candidateRepoId !== repoId),
      )
    : {
        ...current,
        [repoId]: nextRepoState,
      };

export const reduceStoredBrowserTabsState = (
  current: StoredBrowserTabsState,
  input: StoredBrowserTabsAction,
): StoredBrowserTabsState => {
  if (input.type === 'remove-target') {
    const currentRepoState = current[input.repoId] ?? {};

    if (!(input.targetId in currentRepoState)) {
      return current;
    }

    return withUpdatedRepoState(
      current,
      input.repoId,
      Object.fromEntries(
        Object.entries(currentRepoState).filter(([targetId]) => targetId !== input.targetId),
      ),
    );
  }

  if (input.type === 'prune-targets') {
    const currentRepoState = current[input.repoId] ?? {};
    const targetIdSet = new Set(
      input.targetIds.map((targetId) => targetId.trim()).filter(Boolean),
    );
    const nextRepoState = Object.fromEntries(
      Object.entries(currentRepoState).filter(([targetId]) => targetIdSet.has(targetId)),
    );

    if (
      Object.keys(currentRepoState).length === Object.keys(nextRepoState).length &&
      Object.keys(currentRepoState).every((targetId) => targetId in nextRepoState)
    ) {
      return current;
    }

    return withUpdatedRepoState(current, input.repoId, nextRepoState);
  }

  const currentRepoState = current[input.repoId] ?? {};
  const previousTargetState = sanitizeTargetBrowserTabsState(
    input.targetId,
    currentRepoState[input.targetId],
  );
  const nextTargetState = sanitizeTargetBrowserTabsState(
    input.targetId,
    input.updater(previousTargetState),
  );

  if (areTargetBrowserTabsEqual(previousTargetState, nextTargetState)) {
    return current;
  }

  const nextRepoState = isDefaultTargetBrowserTabsState(input.targetId, nextTargetState)
    ? Object.fromEntries(
        Object.entries(currentRepoState).filter(([targetId]) => targetId !== input.targetId),
      )
    : {
        ...currentRepoState,
        [input.targetId]: nextTargetState,
      };

  return withUpdatedRepoState(current, input.repoId, nextRepoState);
};

const storedBrowserTabsAtom = atomWithStorage<StoredBrowserTabsState>(
  STORAGE_KEY,
  {},
);

const browserTabsAtom = atom<StoredBrowserTabsState>((get) =>
  sanitizeStoredBrowserTabsState(get(storedBrowserTabsAtom)),
);

const updateBrowserTabsAtom = atom(
  null,
  (get, set, input: StoredBrowserTabsAction) => {
    const current = get(browserTabsAtom);
    const next = reduceStoredBrowserTabsState(current, input);

    if (next === current) {
      return;
    }

    set(storedBrowserTabsAtom, sanitizeStoredBrowserTabsState(next));
  },
);

export function useRepoBrowserTabs(repoId: string) {
  const stateByRepo = useAtomValue(browserTabsAtom);
  const updateBrowserTabs = useSetAtom(updateBrowserTabsAtom);
  const statesByTargetId = stateByRepo[repoId] ?? {};

  const getTargetState = useCallback((targetId: string): TargetBrowserTabsState =>
    sanitizeTargetBrowserTabsState(targetId, statesByTargetId[targetId]), [statesByTargetId]);

  const addTab = useCallback((targetId: string): BrowserTab => {
    const nextTab: BrowserTab = { id: crypto.randomUUID() };

    updateBrowserTabs({
      type: 'update-target',
      repoId,
      targetId,
      updater: (state) => ({
        activeTabId: nextTab.id,
        tabs: [...state.tabs, nextTab],
      }),
    });

    return nextTab;
  }, [repoId, updateBrowserTabs]);

  const closeTab = useCallback((targetId: string, tabId: string): boolean => {
    const currentState = getTargetState(targetId);

    if (currentState.tabs.length <= 1 || !currentState.tabs.some((tab) => tab.id === tabId)) {
      return false;
    }

    updateBrowserTabs({
      type: 'update-target',
      repoId,
      targetId,
      updater: (state) => {
        const removedTabIndex = state.tabs.findIndex((tab) => tab.id === tabId);
        const nextTabs = state.tabs.filter((tab) => tab.id !== tabId);
        const nextActiveTabId =
          state.activeTabId === tabId
            ? (nextTabs[Math.max(removedTabIndex - 1, 0)]?.id ??
                nextTabs[0]?.id ??
                state.activeTabId)
            : state.activeTabId;

        return {
          activeTabId: nextActiveTabId,
          tabs: nextTabs,
        };
      },
    });

    return true;
  }, [getTargetState, repoId, updateBrowserTabs]);

  const setActiveTab = useCallback((targetId: string, tabId: string) => {
    const currentState = getTargetState(targetId);

    if (
      currentState.activeTabId === tabId ||
      !currentState.tabs.some((tab) => tab.id === tabId)
    ) {
      return;
    }

    updateBrowserTabs({
      type: 'update-target',
      repoId,
      targetId,
      updater: (state) => ({
        ...state,
        activeTabId: tabId,
      }),
    });
  }, [getTargetState, repoId, updateBrowserTabs]);

  const removeTargetState = useCallback((targetId: string) => {
    updateBrowserTabs({
      type: 'remove-target',
      repoId,
      targetId,
    });
  }, [repoId, updateBrowserTabs]);

  const pruneTargetStates = useCallback((targetIds: readonly string[]) => {
    updateBrowserTabs({
      type: 'prune-targets',
      repoId,
      targetIds,
    });
  }, [repoId, updateBrowserTabs]);

  return {
    getTargetState,
    addTab,
    closeTab,
    setActiveTab,
    removeTargetState,
    pruneTargetStates,
  };
}
