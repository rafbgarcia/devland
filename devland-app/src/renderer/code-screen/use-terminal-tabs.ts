import { useCallback } from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type TerminalTab = {
  id: string;
  title: string;
};

type TargetTerminalTabsState = {
  activeTabId: string;
  tabs: TerminalTab[];
};

type StoredTerminalTabsState = Record<string, Record<string, TargetTerminalTabsState>>;

type UpdateTargetInput = {
  type: 'update-target';
  repoId: string;
  targetId: string;
  updater: (state: TargetTerminalTabsState) => TargetTerminalTabsState;
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

export type StoredTerminalTabsAction =
  | UpdateTargetInput
  | RemoveTargetInput
  | PruneTargetsInput;

const STORAGE_KEY = 'devland:terminal-tabs';
const DEFAULT_TERMINAL_TAB_TITLE = 'Terminal 1';
const TERMINAL_TAB_TITLE_PATTERN = /^Terminal\s+(\d+)$/;

export const getDefaultTerminalTabId = (targetId: string): string =>
  `${targetId}:terminal:1`;

export const createDefaultTargetTerminalTabsState = (
  targetId: string,
): TargetTerminalTabsState => ({
  activeTabId: getDefaultTerminalTabId(targetId),
  tabs: [
    {
      id: getDefaultTerminalTabId(targetId),
      title: DEFAULT_TERMINAL_TAB_TITLE,
    },
  ],
});

const sanitizeTerminalTab = (value: unknown): TerminalTab | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id =
    typeof record.id === 'string' && record.id.trim() !== ''
      ? record.id
      : null;
  const title =
    typeof record.title === 'string' && record.title.trim() !== ''
      ? record.title
      : null;

  if (id === null || title === null) {
    return null;
  }

  return {
    id,
    title,
  };
};

export const sanitizeTargetTerminalTabsState = (
  targetId: string,
  value: unknown,
): TargetTerminalTabsState => {
  const fallbackState = createDefaultTargetTerminalTabsState(targetId);

  if (typeof value !== 'object' || value === null) {
    return fallbackState;
  }

  const record = value as Record<string, unknown>;
  const tabs = Array.isArray(record.tabs)
    ? record.tabs.flatMap((candidate) => {
        const tab = sanitizeTerminalTab(candidate);

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

export const sanitizeStoredTerminalTabsState = (
  value: unknown,
): StoredTerminalTabsState => {
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
            sanitizeTargetTerminalTabsState(normalizedTargetId, state),
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

const areTargetTerminalTabsEqual = (
  left: TargetTerminalTabsState,
  right: TargetTerminalTabsState,
): boolean =>
  left.activeTabId === right.activeTabId &&
  left.tabs.length === right.tabs.length &&
  left.tabs.every((tab, index) => {
    const candidate = right.tabs[index];

    return candidate !== undefined &&
      candidate.id === tab.id &&
      candidate.title === tab.title;
  });

const isDefaultTargetTerminalTabsState = (
  targetId: string,
  state: TargetTerminalTabsState,
): boolean =>
  areTargetTerminalTabsEqual(state, createDefaultTargetTerminalTabsState(targetId));

const withUpdatedRepoState = (
  current: StoredTerminalTabsState,
  repoId: string,
  nextRepoState: Record<string, TargetTerminalTabsState>,
): StoredTerminalTabsState =>
  Object.keys(nextRepoState).length === 0
    ? Object.fromEntries(
        Object.entries(current).filter(([candidateRepoId]) => candidateRepoId !== repoId),
      )
    : {
        ...current,
        [repoId]: nextRepoState,
      };

export const reduceStoredTerminalTabsState = (
  current: StoredTerminalTabsState,
  input: StoredTerminalTabsAction,
): StoredTerminalTabsState => {
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
  const previousTargetState = sanitizeTargetTerminalTabsState(
    input.targetId,
    currentRepoState[input.targetId],
  );
  const nextTargetState = sanitizeTargetTerminalTabsState(
    input.targetId,
    input.updater(previousTargetState),
  );

  if (areTargetTerminalTabsEqual(previousTargetState, nextTargetState)) {
    return current;
  }

  const nextRepoState = isDefaultTargetTerminalTabsState(input.targetId, nextTargetState)
    ? Object.fromEntries(
        Object.entries(currentRepoState).filter(([targetId]) => targetId !== input.targetId),
      )
    : {
        ...currentRepoState,
        [input.targetId]: nextTargetState,
      };

  return withUpdatedRepoState(current, input.repoId, nextRepoState);
};

const nextTerminalTabTitle = (tabs: readonly TerminalTab[]): string => {
  const highestTabNumber = tabs.reduce((highest, tab) => {
    const match = TERMINAL_TAB_TITLE_PATTERN.exec(tab.title);

    if (match === null) {
      return highest;
    }

    return Math.max(highest, Number(match[1]));
  }, 0);

  return `Terminal ${highestTabNumber + 1}`;
};

const storedTerminalTabsAtom = atomWithStorage<StoredTerminalTabsState>(
  STORAGE_KEY,
  {},
);

const terminalTabsAtom = atom<StoredTerminalTabsState>((get) =>
  sanitizeStoredTerminalTabsState(get(storedTerminalTabsAtom)),
);

const updateTerminalTabsAtom = atom(
  null,
  (get, set, input: StoredTerminalTabsAction) => {
    const current = get(terminalTabsAtom);
    const next = reduceStoredTerminalTabsState(current, input);

    if (next === current) {
      return;
    }

    set(storedTerminalTabsAtom, sanitizeStoredTerminalTabsState(next));
  },
);

export function useRepoTerminalTabs(repoId: string) {
  const stateByRepo = useAtomValue(terminalTabsAtom);
  const updateTerminalTabs = useSetAtom(updateTerminalTabsAtom);
  const statesByTargetId = stateByRepo[repoId] ?? {};

  const getTargetState = useCallback((targetId: string): TargetTerminalTabsState =>
    sanitizeTargetTerminalTabsState(targetId, statesByTargetId[targetId]), [statesByTargetId]);

  const addTab = useCallback((targetId: string): TerminalTab => {
    const currentState = getTargetState(targetId);
    const nextTab: TerminalTab = {
      id: crypto.randomUUID(),
      title: nextTerminalTabTitle(currentState.tabs),
    };

    updateTerminalTabs({
      type: 'update-target',
      repoId,
      targetId,
      updater: (state) => ({
        activeTabId: nextTab.id,
        tabs: [...state.tabs, nextTab],
      }),
    });

    return nextTab;
  }, [getTargetState, repoId, updateTerminalTabs]);

  const closeTab = useCallback((targetId: string, tabId: string): boolean => {
    const currentState = getTargetState(targetId);

    if (currentState.tabs.length <= 1 || !currentState.tabs.some((tab) => tab.id === tabId)) {
      return false;
    }

    updateTerminalTabs({
      type: 'update-target',
      repoId,
      targetId,
      updater: (state) => {
        const removedTabIndex = state.tabs.findIndex((tab) => tab.id === tabId);
        const nextTabs = state.tabs.filter((tab) => tab.id !== tabId);
        const nextActiveTabId =
          state.activeTabId === tabId
            ? (nextTabs[Math.max(removedTabIndex - 1, 0)]?.id ?? nextTabs[0]?.id ?? state.activeTabId)
            : state.activeTabId;

        return {
          activeTabId: nextActiveTabId,
          tabs: nextTabs,
        };
      },
    });

    return true;
  }, [getTargetState, repoId, updateTerminalTabs]);

  const setActiveTab = useCallback((targetId: string, tabId: string) => {
    const currentState = getTargetState(targetId);

    if (currentState.activeTabId === tabId || !currentState.tabs.some((tab) => tab.id === tabId)) {
      return;
    }

    updateTerminalTabs({
      type: 'update-target',
      repoId,
      targetId,
      updater: (state) => ({
        ...state,
        activeTabId: tabId,
      }),
    });
  }, [getTargetState, repoId, updateTerminalTabs]);

  const renameTab = useCallback((targetId: string, tabId: string, title: string): boolean => {
    const normalizedTitle = title.trim();
    const currentState = getTargetState(targetId);
    const currentTab = currentState.tabs.find((tab) => tab.id === tabId);

    if (
      normalizedTitle.length === 0 ||
      currentTab === undefined ||
      currentTab.title === normalizedTitle
    ) {
      return false;
    }

    updateTerminalTabs({
      type: 'update-target',
      repoId,
      targetId,
      updater: (state) => ({
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === tabId
            ? { ...tab, title: normalizedTitle }
            : tab,
        ),
      }),
    });

    return true;
  }, [getTargetState, repoId, updateTerminalTabs]);

  const removeTargetState = useCallback((targetId: string) => {
    updateTerminalTabs({
      type: 'remove-target',
      repoId,
      targetId,
    });
  }, [repoId, updateTerminalTabs]);

  const pruneTargetStates = useCallback((targetIds: readonly string[]) => {
    updateTerminalTabs({
      type: 'prune-targets',
      repoId,
      targetIds,
    });
  }, [repoId, updateTerminalTabs]);

  return {
    getTargetState,
    addTab,
    closeTab,
    renameTab,
    setActiveTab,
    removeTargetState,
    pruneTargetStates,
  };
}
