import { useCallback, useEffect } from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import {
  type AvailableExternalEditor,
  ExternalEditorPreferenceSchema,
  type ExternalEditorPreference,
} from '@/ipc/contracts';

export type AppPreferences = {
  externalEditor: ExternalEditorPreference | null;
};

const STORAGE_KEY = 'devland:app-preferences';

const DEFAULT_APP_PREFERENCES: AppPreferences = {
  externalEditor: null,
};

const sanitizeAppPreferences = (value: unknown): AppPreferences => {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_APP_PREFERENCES;
  }

  const record = value as Record<string, unknown>;
  const parsedExternalEditor = ExternalEditorPreferenceSchema.safeParse(
    record.externalEditor,
  );

  return {
    externalEditor: parsedExternalEditor.success ? parsedExternalEditor.data : null,
  };
};

const storedAppPreferencesAtom = atomWithStorage<AppPreferences>(
  STORAGE_KEY,
  DEFAULT_APP_PREFERENCES,
);

const appPreferencesAtom = atom<AppPreferences>((get) =>
  sanitizeAppPreferences(get(storedAppPreferencesAtom)),
);

const updateAppPreferencesAtom = atom(
  null,
  (
    get,
    set,
    nextPreferences:
      | Partial<AppPreferences>
      | ((current: AppPreferences) => AppPreferences),
  ) => {
    const currentPreferences = get(appPreferencesAtom);
    const resolvedPreferences =
      typeof nextPreferences === 'function'
        ? nextPreferences(currentPreferences)
        : { ...currentPreferences, ...nextPreferences };

    set(
      storedAppPreferencesAtom,
      sanitizeAppPreferences(resolvedPreferences),
    );
  },
);

const toDetectedEditorPreference = (
  editor: AvailableExternalEditor,
): ExternalEditorPreference => ({
  kind: 'detected',
  editorId: editor.id,
  editorName: editor.name,
});

export function useAppPreferences() {
  const preferences = useAtomValue(appPreferencesAtom);
  const updatePreferences = useSetAtom(updateAppPreferencesAtom);

  const setExternalEditorPreference = useCallback(
    (externalEditor: ExternalEditorPreference | null) =>
      updatePreferences({ externalEditor }),
    [updatePreferences],
  );

  return {
    preferences,
    updatePreferences,
    setExternalEditorPreference,
  };
}

export function useEnsureExternalEditorPreference() {
  const { preferences, setExternalEditorPreference } = useAppPreferences();

  useEffect(() => {
    if (preferences.externalEditor !== null) {
      return;
    }

    let isCancelled = false;

    const ensurePreference = async () => {
      try {
        const availableEditors = await window.electronAPI.listAvailableExternalEditors();
        const firstEditor = availableEditors[0];

        if (isCancelled || firstEditor === undefined) {
          return;
        }

        setExternalEditorPreference(toDetectedEditorPreference(firstEditor));
      } catch {
        // Best-effort hydration. If lookup fails, the user can still choose manually.
      }
    };

    void ensurePreference();

    return () => {
      isCancelled = true;
    };
  }, [preferences.externalEditor, setExternalEditorPreference]);
}

export async function resolveDetectedExternalEditorPreference():
  Promise<ExternalEditorPreference | null> {
  const availableEditors = await window.electronAPI.listAvailableExternalEditors();
  const firstEditor = availableEditors[0];

  return firstEditor === undefined ? null : toDetectedEditorPreference(firstEditor);
}
