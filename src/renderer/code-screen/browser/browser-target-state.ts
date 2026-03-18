import { useEffect, useMemo, useState } from 'react';

import type { BrowserViewSnapshot } from '@/ipc/contracts';

const STORAGE_KEY = 'devland:browser-target-state';
const BLANK_PAGE_URL = 'about:blank';

type PersistedBrowserTargetState = {
  lastUrl: string | null;
};

type PersistedBrowserStateRecord = Record<string, PersistedBrowserTargetState>;

const createDefaultSnapshot = (targetId: string): BrowserViewSnapshot => ({
  targetId,
  currentUrl: BLANK_PAGE_URL,
  pageTitle: '',
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  isVisible: false,
  lastLoadError: null,
});

const readStoredBrowserState = (): PersistedBrowserStateRecord => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');

    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([targetId, value]) => {
        if (typeof value !== 'object' || value === null) {
          return [];
        }

        const lastUrl =
          typeof (value as PersistedBrowserTargetState).lastUrl === 'string'
            ? (value as PersistedBrowserTargetState).lastUrl
            : null;

        return [[targetId, { lastUrl }]];
      }),
    );
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

  const next = Object.fromEntries(
    Object.entries(current).filter(([currentTargetId]) => currentTargetId !== targetId),
  );
  writeStoredBrowserState(next);
};

export function useBrowserTargetState(targetId: string) {
  const [snapshot, setSnapshot] = useState<BrowserViewSnapshot>(() =>
    createDefaultSnapshot(targetId),
  );
  const [rememberedUrl, setRememberedUrlState] = useState<string>(() => {
    const current = readStoredBrowserState();

    return current[targetId]?.lastUrl ?? '';
  });

  useEffect(() => {
    setSnapshot(createDefaultSnapshot(targetId));
    setRememberedUrlState(readStoredBrowserState()[targetId]?.lastUrl ?? '');
  }, [targetId]);

  useEffect(() => window.electronAPI.onBrowserViewEvent((event) => {
    if (event.type !== 'snapshot' || event.snapshot.targetId !== targetId) {
      return;
    }

    setSnapshot(event.snapshot);

    if (event.snapshot.currentUrl === BLANK_PAGE_URL) {
      return;
    }

    const current = readStoredBrowserState();
    const next = {
      ...current,
      [targetId]: {
        lastUrl: event.snapshot.currentUrl,
      },
    };

    writeStoredBrowserState(next);
    setRememberedUrlState(event.snapshot.currentUrl);
  }), [targetId]);

  const setRememberedUrl = (nextUrl: string | null): void => {
    const current = readStoredBrowserState();
    const trimmed = nextUrl?.trim() ?? '';
    const resolvedUrl = trimmed.length > 0 ? trimmed : null;

    if (resolvedUrl === null) {
      clearBrowserTargetState(targetId);
      setRememberedUrlState('');
      return;
    }

    writeStoredBrowserState({
      ...current,
      [targetId]: {
        lastUrl: resolvedUrl,
      },
    });
    setRememberedUrlState(resolvedUrl);
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
