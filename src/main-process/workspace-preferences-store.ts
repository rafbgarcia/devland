import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DEFAULT_PROJECT_VIEW_TAB,
  PROJECT_VIEW_TABS,
  type WorkspacePreferences,
} from '../ipc/contracts';

const STORE_DIRECTORY_NAME = 'state';
const STORE_FILE_NAME = 'workspace-preferences.json';

type PersistedWorkspacePreferences = {
  version: 1;
  lastRepoId: string | null;
  lastTab: string;
};

const DEFAULT_WORKSPACE_PREFERENCES: WorkspacePreferences = {
  lastRepoId: null,
  lastTab: DEFAULT_PROJECT_VIEW_TAB,
};

const VALID_PROJECT_VIEW_TABS = new Set<string>(PROJECT_VIEW_TABS);

const isProjectViewTab = (
  value: string,
): value is WorkspacePreferences['lastTab'] => VALID_PROJECT_VIEW_TABS.has(value);

const getStoreDirectoryPath = (): string =>
  path.join(app.getPath('userData'), STORE_DIRECTORY_NAME);

const getStoreFilePath = (): string =>
  path.join(getStoreDirectoryPath(), STORE_FILE_NAME);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parsePersistedWorkspacePreferences = (
  value: unknown,
): WorkspacePreferences => {
  if (!isRecord(value)) {
    return DEFAULT_WORKSPACE_PREFERENCES;
  }

  const lastRepoId =
    typeof value.lastRepoId === 'string' && value.lastRepoId.trim() !== ''
      ? value.lastRepoId
      : null;
  const lastTab =
    typeof value.lastTab === 'string' && isProjectViewTab(value.lastTab)
      ? value.lastTab
      : DEFAULT_PROJECT_VIEW_TAB;

  return {
    lastRepoId,
    lastTab,
  };
};

const readPersistedWorkspacePreferences = async (): Promise<WorkspacePreferences> => {
  try {
    const fileContents = await readFile(getStoreFilePath(), 'utf8');
    const parsedValue = JSON.parse(fileContents) as unknown;

    return parsePersistedWorkspacePreferences(parsedValue);
  } catch (error) {
    const readError = error as NodeJS.ErrnoException;

    if (readError.code === 'ENOENT') {
      return DEFAULT_WORKSPACE_PREFERENCES;
    }

    console.error('Failed to read persisted workspace preferences.', readError);
    return DEFAULT_WORKSPACE_PREFERENCES;
  }
};

const writePersistedWorkspacePreferences = async (
  preferences: WorkspacePreferences,
): Promise<void> => {
  const persistedPreferences: PersistedWorkspacePreferences = {
    version: 1,
    lastRepoId: preferences.lastRepoId,
    lastTab: preferences.lastTab,
  };

  await mkdir(getStoreDirectoryPath(), { recursive: true });
  await writeFile(
    getStoreFilePath(),
    JSON.stringify(persistedPreferences, null, 2),
    'utf8',
  );
};

export const getWorkspacePreferences = async (): Promise<WorkspacePreferences> =>
  readPersistedWorkspacePreferences();

export const updateWorkspacePreferences = async (
  patch: Partial<WorkspacePreferences>,
): Promise<WorkspacePreferences> => {
  const currentPreferences = await readPersistedWorkspacePreferences();
  const nextPreferences: WorkspacePreferences = {
    lastRepoId:
      patch.lastRepoId === undefined ? currentPreferences.lastRepoId : patch.lastRepoId,
    lastTab: patch.lastTab ?? currentPreferences.lastTab,
  };

  await writePersistedWorkspacePreferences(nextPreferences);

  return nextPreferences;
};
