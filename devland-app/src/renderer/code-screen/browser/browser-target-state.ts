import { useEffect, useMemo, useState } from 'react';

import type { BrowserViewSnapshot } from '@/ipc/contracts';

const STORAGE_KEY = 'devland:browser-target-state';
export const BLANK_PAGE_URL = 'about:blank';

export type PersistedBrowserTargetState = {
  lastUrl: string | null;
};

export type PersistedBrowserStateRecord = Record<string, PersistedBrowserTargetState>;

export const createDefaultBrowserSnapshot = (targetId: string): BrowserViewSnapshot => ({
  targetId,
  currentUrl: BLANK_PAGE_URL,
  pageTitle: '',
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  isVisible: false,
  lastLoadError: null,
});

export const sanitizeStoredBrowserState = (
  value: unknown,
): PersistedBrowserStateRecord => {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([targetId, candidate]) => {
      if (typeof candidate !== 'object' || candidate === null) {
        return [];
      }

      const lastUrl =
        typeof (candidate as PersistedBrowserTargetState).lastUrl === 'string'
          ? (candidate as PersistedBrowserTargetState).lastUrl
          : null;

      return [[targetId, { lastUrl }]];
    }),
  );
};

export const getRememberedBrowserUrl = (
  state: PersistedBrowserStateRecord,
  targetId: string,
): string => state[targetId]?.lastUrl ?? '';

export const setRememberedBrowserUrl = (
  state: PersistedBrowserStateRecord,
  targetId: string,
  nextUrl: string | null,
): PersistedBrowserStateRecord => {
  const trimmed = nextUrl?.trim() ?? '';

  if (trimmed.length === 0) {
    return Object.fromEntries(
      Object.entries(state).filter(([currentTargetId]) => currentTargetId !== targetId),
    );
  }

  return {
    ...state,
    [targetId]: {
      lastUrl: trimmed,
    },
  };
};

const readStoredBrowserState = (): PersistedBrowserStateRecord => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');

    return sanitizeStoredBrowserState(parsed);
  } catch {
    return {};
  }
};

const writeStoredBrowserState = (nextState: PersistedBrowserStateRecord): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
};

export const clearBrowserTargetState = (targetId: string): void => {
  const current = readStoredBrowserState();

  if (!(targetId in current)) {
    return;
  }

  const next = setRememberedBrowserUrl(current, targetId, null);
  writeStoredBrowserState(next);
};

export function useBrowserTargetState(targetId: string) {
  const [snapshot, setSnapshot] = useState<BrowserViewSnapshot>(() =>
    createDefaultBrowserSnapshot(targetId),
  );
  const [rememberedUrl, setRememberedUrlState] = useState<string>(() => {
    const current = readStoredBrowserState();

    return getRememberedBrowserUrl(current, targetId);
  });

  useEffect(() => {
    setSnapshot(createDefaultBrowserSnapshot(targetId));
    setRememberedUrlState(getRememberedBrowserUrl(readStoredBrowserState(), targetId));
  }, [targetId]);

  useEffect(() => window.electronAPI.onBrowserViewEvent((event) => {
    if (event.type !== 'snapshot' || event.snapshot.targetId !== targetId) {
      return;
    }

    setSnapshot(event.snapshot);

    if (event.snapshot.currentUrl === BLANK_PAGE_URL) {
      return;
    }

    const next = setRememberedBrowserUrl(
      readStoredBrowserState(),
      targetId,
      event.snapshot.currentUrl,
    );

    writeStoredBrowserState(next);
    setRememberedUrlState(event.snapshot.currentUrl);
  }), [targetId]);

  const setRememberedUrl = (nextUrl: string | null): void => {
    const nextState = setRememberedBrowserUrl(
      readStoredBrowserState(),
      targetId,
      nextUrl,
    );

    if (!(targetId in nextState)) {
      clearBrowserTargetState(targetId);
      setRememberedUrlState('');
      return;
    }

    writeStoredBrowserState(nextState);
    setRememberedUrlState(getRememberedBrowserUrl(nextState, targetId));
  };

  return useMemo(
    () => ({
      snapshot,
      rememberedUrl,
      setRememberedUrl,
    }),
    [rememberedUrl, snapshot],
  );
}
