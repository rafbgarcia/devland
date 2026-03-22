import { useCallback, useEffect, useMemo, useState } from 'react';

import type { BrowserViewSnapshot } from '@/ipc/contracts';

const STORAGE_KEY = 'devland:browser-view-state';
export const BLANK_PAGE_URL = 'about:blank';

export type PersistedBrowserViewState = {
  codeTargetId: string;
  lastUrl: string | null;
  pageTitle: string | null;
};

export type PersistedBrowserViewStateRecord = Record<string, PersistedBrowserViewState>;

export const createDefaultBrowserSnapshot = (
  browserViewId: string,
  codeTargetId: string,
): BrowserViewSnapshot => ({
  browserViewId,
  codeTargetId,
  currentUrl: BLANK_PAGE_URL,
  pageTitle: '',
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  isVisible: false,
  lastLoadError: null,
});

export const sanitizeStoredBrowserViewState = (
  value: unknown,
): PersistedBrowserViewStateRecord => {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([browserViewId, candidate]) => {
      if (typeof browserViewId !== 'string' || browserViewId.trim() === '') {
        return [];
      }

      if (typeof candidate !== 'object' || candidate === null) {
        return [];
      }

      const record = candidate as Record<string, unknown>;
      const codeTargetId =
        typeof record.codeTargetId === 'string' && record.codeTargetId.trim() !== ''
          ? record.codeTargetId
          : null;

      if (codeTargetId === null) {
        return [];
      }

      const lastUrl = typeof record.lastUrl === 'string' ? record.lastUrl : null;
      const pageTitle = typeof record.pageTitle === 'string' ? record.pageTitle : null;

      return [[browserViewId, { codeTargetId, lastUrl, pageTitle }]];
    }),
  );
};

export const getRememberedBrowserUrl = (
  state: PersistedBrowserViewStateRecord,
  browserViewId: string,
): string => state[browserViewId]?.lastUrl ?? '';

export const getRememberedBrowserPageTitle = (
  state: PersistedBrowserViewStateRecord,
  browserViewId: string,
): string => state[browserViewId]?.pageTitle ?? '';

export const setRememberedBrowserUrl = (
  state: PersistedBrowserViewStateRecord,
  input: {
    browserViewId: string;
    codeTargetId: string;
    nextUrl: string | null;
  },
): PersistedBrowserViewStateRecord => {
  const trimmedUrl = input.nextUrl?.trim() ?? '';

  if (trimmedUrl.length === 0) {
    return Object.fromEntries(
      Object.entries(state).filter(([browserViewId]) => browserViewId !== input.browserViewId),
    );
  }

  return {
    ...state,
    [input.browserViewId]: {
      codeTargetId: input.codeTargetId,
      lastUrl: trimmedUrl,
      pageTitle: state[input.browserViewId]?.pageTitle ?? null,
    },
  };
};

export const syncBrowserViewSnapshot = (
  state: PersistedBrowserViewStateRecord,
  snapshot: BrowserViewSnapshot,
): PersistedBrowserViewStateRecord => {
  const nextUrl =
    snapshot.currentUrl === BLANK_PAGE_URL ? null : snapshot.currentUrl.trim() || null;
  const nextPageTitle = snapshot.pageTitle.trim() || null;
  const current = state[snapshot.browserViewId];

  if (
    current?.codeTargetId === snapshot.codeTargetId &&
    current.lastUrl === nextUrl &&
    current.pageTitle === nextPageTitle
  ) {
    return state;
  }

  if (nextUrl === null && nextPageTitle === null) {
    return Object.fromEntries(
      Object.entries(state).filter(
        ([browserViewId]) => browserViewId !== snapshot.browserViewId,
      ),
    );
  }

  return {
    ...state,
    [snapshot.browserViewId]: {
      codeTargetId: snapshot.codeTargetId,
      lastUrl: nextUrl,
      pageTitle: nextPageTitle,
    },
  };
};

const removeBrowserViewState = (
  state: PersistedBrowserViewStateRecord,
  browserViewId: string,
): PersistedBrowserViewStateRecord =>
  Object.fromEntries(
    Object.entries(state).filter(([candidateBrowserViewId]) => candidateBrowserViewId !== browserViewId),
  );

const removeCodeTargetBrowserState = (
  state: PersistedBrowserViewStateRecord,
  codeTargetId: string,
): PersistedBrowserViewStateRecord =>
  Object.fromEntries(
    Object.entries(state).filter(([, candidate]) => candidate.codeTargetId !== codeTargetId),
  );

export const readStoredBrowserViewState = (): PersistedBrowserViewStateRecord => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');

    return sanitizeStoredBrowserViewState(parsed);
  } catch {
    return {};
  }
};

export const writeStoredBrowserViewState = (
  nextState: PersistedBrowserViewStateRecord,
): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
};

export const clearBrowserViewState = (browserViewId: string): void => {
  const current = readStoredBrowserViewState();
  const next = removeBrowserViewState(current, browserViewId);

  if (next === current) {
    return;
  }

  writeStoredBrowserViewState(next);
};

export const clearCodeTargetBrowserState = (codeTargetId: string): void => {
  const current = readStoredBrowserViewState();
  const next = removeCodeTargetBrowserState(current, codeTargetId);

  if (next === current) {
    return;
  }

  writeStoredBrowserViewState(next);
};

export function useBrowserViewsState(
  codeTargetId: string,
  browserViewIds: readonly string[],
) {
  const [storedState, setStoredState] = useState<PersistedBrowserViewStateRecord>(() =>
    readStoredBrowserViewState(),
  );
  const [snapshotsById, setSnapshotsById] = useState<Record<string, BrowserViewSnapshot>>({});
  const browserViewIdsKey = browserViewIds.join('\u0000');
  const stableBrowserViewIds = useMemo(() => [...browserViewIds], [browserViewIdsKey]);

  useEffect(() => {
    setStoredState(readStoredBrowserViewState());
    setSnapshotsById((current) =>
      Object.fromEntries(
        stableBrowserViewIds.map((browserViewId) => [
          browserViewId,
          current[browserViewId] ?? createDefaultBrowserSnapshot(browserViewId, codeTargetId),
        ]),
      ),
    );
  }, [browserViewIdsKey, codeTargetId, stableBrowserViewIds]);

  useEffect(() => {
    const browserViewIdSet = new Set(stableBrowserViewIds);

    return window.electronAPI.onBrowserViewEvent((event) => {
      if (event.type !== 'snapshot' || !browserViewIdSet.has(event.snapshot.browserViewId)) {
        return;
      }

      setSnapshotsById((current) => ({
        ...current,
        [event.snapshot.browserViewId]: event.snapshot,
      }));
      setStoredState((current) => {
        const next = syncBrowserViewSnapshot(current, event.snapshot);

        if (next !== current) {
          writeStoredBrowserViewState(next);
        }

        return next;
      });
    });
  }, [stableBrowserViewIds]);

  const setRememberedUrl = useCallback((browserViewId: string, nextUrl: string | null) => {
    setStoredState((current) => {
      const next = setRememberedBrowserUrl(current, {
        browserViewId,
        codeTargetId,
        nextUrl,
      });

      if (next !== current) {
        writeStoredBrowserViewState(next);
      }

      return next;
    });
  }, [codeTargetId]);

  const getSnapshot = useCallback((browserViewId: string): BrowserViewSnapshot =>
    snapshotsById[browserViewId] ??
    createDefaultBrowserSnapshot(browserViewId, codeTargetId), [codeTargetId, snapshotsById]);

  const getRememberedUrl = useCallback((browserViewId: string): string =>
    getRememberedBrowserUrl(storedState, browserViewId), [storedState]);

  const getRememberedPageTitle = useCallback((browserViewId: string): string =>
    getRememberedBrowserPageTitle(storedState, browserViewId), [storedState]);

  return useMemo(
    () => ({
      getSnapshot,
      getRememberedUrl,
      getRememberedPageTitle,
      setRememberedUrl,
    }),
    [getRememberedPageTitle, getRememberedUrl, getSnapshot, setRememberedUrl],
  );
}
