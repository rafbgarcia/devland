import { useCallback } from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import {
  DEFAULT_CODEX_COMPOSER_SETTINGS,
  sanitizeCodexComposerSettings,
  type CodexComposerSettings,
} from '@/lib/codex-chat';

export type RepoCodexSettings = {
  composerSettings: CodexComposerSettings;
  browserControlEnabled: boolean;
};

type StoredRepoCodexSettings = Record<string, RepoCodexSettings>;

const STORAGE_KEY = 'devland:repo-codex-settings';

export const DEFAULT_REPO_CODEX_SETTINGS: RepoCodexSettings = {
  composerSettings: DEFAULT_CODEX_COMPOSER_SETTINGS,
  browserControlEnabled: false,
};

export const sanitizeRepoCodexSettings = (value: unknown): RepoCodexSettings => {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_REPO_CODEX_SETTINGS;
  }

  const record = value as Record<string, unknown>;

  return {
    composerSettings: sanitizeCodexComposerSettings(record.composerSettings),
    browserControlEnabled:
      typeof record.browserControlEnabled === 'boolean'
        ? record.browserControlEnabled
        : DEFAULT_REPO_CODEX_SETTINGS.browserControlEnabled,
  };
};

export const sanitizeStoredRepoCodexSettings = (
  value: unknown,
): StoredRepoCodexSettings => {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([repoId, candidate]) => {
      const normalizedRepoId = repoId.trim();

      if (normalizedRepoId === '') {
        return [];
      }

      return [[normalizedRepoId, sanitizeRepoCodexSettings(candidate)]];
    }),
  );
};

const storedRepoCodexSettingsAtom = atomWithStorage<StoredRepoCodexSettings>(
  STORAGE_KEY,
  {},
);

const repoCodexSettingsAtom = atom<StoredRepoCodexSettings>((get) =>
  sanitizeStoredRepoCodexSettings(get(storedRepoCodexSettingsAtom)),
);

const areComposerSettingsEqual = (
  left: CodexComposerSettings,
  right: CodexComposerSettings,
): boolean =>
  left.model === right.model &&
  left.reasoningEffort === right.reasoningEffort &&
  left.fastMode === right.fastMode &&
  left.runtimeMode === right.runtimeMode &&
  left.interactionMode === right.interactionMode;

const updateRepoCodexSettingsAtom = atom(
  null,
  (
    get,
    set,
    input: {
      repoId: string;
      updater: (current: RepoCodexSettings) => RepoCodexSettings;
    },
  ) => {
    const current = get(repoCodexSettingsAtom);
    const previousSettings = sanitizeRepoCodexSettings(current[input.repoId]);
    const nextSettings = sanitizeRepoCodexSettings(input.updater(previousSettings));

    if (
      previousSettings.browserControlEnabled === nextSettings.browserControlEnabled &&
      areComposerSettingsEqual(
        previousSettings.composerSettings,
        nextSettings.composerSettings,
      )
    ) {
      return;
    }

    set(storedRepoCodexSettingsAtom, {
      ...current,
      [input.repoId]: nextSettings,
    });
  },
);

export function useRepoCodexSettings(repoId: string) {
  const settingsByRepo = useAtomValue(repoCodexSettingsAtom);
  const updateRepoCodexSettings = useSetAtom(updateRepoCodexSettingsAtom);
  const settings = sanitizeRepoCodexSettings(settingsByRepo[repoId]);

  const setComposerSettings = useCallback(
    (composerSettings: CodexComposerSettings) => {
      updateRepoCodexSettings({
        repoId,
        updater: (current) => ({
          ...current,
          composerSettings,
        }),
      });
    },
    [repoId, updateRepoCodexSettings],
  );

  const setBrowserControlEnabled = useCallback(
    (browserControlEnabled: boolean) => {
      updateRepoCodexSettings({
        repoId,
        updater: (current) => ({
          ...current,
          browserControlEnabled,
        }),
      });
    },
    [repoId, updateRepoCodexSettings],
  );

  return {
    settings,
    setComposerSettings,
    setBrowserControlEnabled,
  };
}
