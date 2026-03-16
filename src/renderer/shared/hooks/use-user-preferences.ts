import { useCallback } from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import type { DiffDisplayMode } from '@/lib/diff';

type UserPreferences = {
  diffDisplayMode: DiffDisplayMode;
};

const STORAGE_KEY = 'devland:user-preferences';

const DEFAULT_USER_PREFERENCES: UserPreferences = {
  diffDisplayMode: 'unified',
};

function sanitizeUserPreferences(value: unknown): UserPreferences {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_USER_PREFERENCES;
  }

  const candidate = value as { diffDisplayMode?: unknown };
  const diffDisplayMode =
    candidate.diffDisplayMode === 'split' || candidate.diffDisplayMode === 'unified'
      ? candidate.diffDisplayMode
      : DEFAULT_USER_PREFERENCES.diffDisplayMode;

  return {
    diffDisplayMode,
  };
}

const storedUserPreferencesAtom = atomWithStorage<UserPreferences>(
  STORAGE_KEY,
  DEFAULT_USER_PREFERENCES,
);

const userPreferencesAtom = atom<UserPreferences>((get) =>
  sanitizeUserPreferences(get(storedUserPreferencesAtom)),
);

const updateUserPreferencesAtom = atom(
  null,
  (
    get,
    set,
    nextPreferences:
      | Partial<UserPreferences>
      | ((preferences: UserPreferences) => UserPreferences),
  ) => {
    const currentPreferences = get(userPreferencesAtom);
    const resolvedPreferences =
      typeof nextPreferences === 'function'
        ? nextPreferences(currentPreferences)
        : { ...currentPreferences, ...nextPreferences };

    set(storedUserPreferencesAtom, sanitizeUserPreferences(resolvedPreferences));
  },
);

export function useUserPreferences() {
  const preferences = useAtomValue(userPreferencesAtom);
  const updatePreferences = useSetAtom(updateUserPreferencesAtom);

  const setDiffDisplayMode = useCallback(
    (diffDisplayMode: DiffDisplayMode) => {
      updatePreferences({ diffDisplayMode });
    },
    [updatePreferences],
  );

  return {
    preferences,
    updatePreferences,
    setDiffDisplayMode,
  };
}
