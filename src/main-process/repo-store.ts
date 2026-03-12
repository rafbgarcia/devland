import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Repo } from '../ipc/contracts';
import { isAbsoluteRepoPath } from './git';

const STORE_DIRECTORY_NAME = 'state';
const STORE_FILE_NAME = 'repos.json';

type PersistedRepoState = {
  version: 1;
  repos: Repo[];
};

const DEFAULT_REPO_STATE: PersistedRepoState = {
  version: 1,
  repos: [],
};

const getStoreDirectoryPath = (): string =>
  path.join(app.getPath('userData'), STORE_DIRECTORY_NAME);

const getStoreFilePath = (): string =>
  path.join(getStoreDirectoryPath(), STORE_FILE_NAME);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getRepoKey = (repoPath: string): string => {
  if (isAbsoluteRepoPath(repoPath)) {
    return path.normalize(repoPath);
  }

  return repoPath.toLowerCase();
};

const parsePersistedRepoState = (value: unknown): PersistedRepoState => {
  if (!isRecord(value) || !Array.isArray(value.repos)) {
    return DEFAULT_REPO_STATE;
  }

  const repos: Repo[] = [];
  const seenRepoKeys = new Set<string>();

  for (const candidate of value.repos) {
    if (!isRecord(candidate) || typeof candidate.path !== 'string') {
      continue;
    }

    const normalizedPath = candidate.path.trim();

    if (!normalizedPath) {
      continue;
    }

    const repoKey = getRepoKey(normalizedPath);

    if (seenRepoKeys.has(repoKey)) {
      continue;
    }

    seenRepoKeys.add(repoKey);
    repos.push({ path: normalizedPath });
  }

  return {
    version: 1,
    repos,
  };
};

const readPersistedRepoState = async (): Promise<PersistedRepoState> => {
  try {
    const fileContents = await readFile(getStoreFilePath(), 'utf8');
    const parsedValue = JSON.parse(fileContents) as unknown;

    return parsePersistedRepoState(parsedValue);
  } catch (error) {
    const readError = error as NodeJS.ErrnoException;

    if (readError.code === 'ENOENT') {
      return DEFAULT_REPO_STATE;
    }

    console.error('Failed to read persisted repo state.', readError);
    return DEFAULT_REPO_STATE;
  }
};

const writePersistedRepoState = async (
  repoState: PersistedRepoState,
): Promise<void> => {
  await mkdir(getStoreDirectoryPath(), { recursive: true });
  await writeFile(
    getStoreFilePath(),
    JSON.stringify(repoState, null, 2),
    'utf8',
  );
};

export const getSavedRepos = async (): Promise<Repo[]> =>
  (await readPersistedRepoState()).repos;

export const saveRepoPath = async (repoPath: string): Promise<Repo> => {
  const persistedState = await readPersistedRepoState();
  const repoKey = getRepoKey(repoPath);
  const existingRepo = persistedState.repos.find(
    (repo) => getRepoKey(repo.path) === repoKey,
  );

  if (existingRepo) {
    return existingRepo;
  }

  const repo = { path: repoPath };

  await writePersistedRepoState({
    version: 1,
    repos: [repo, ...persistedState.repos],
  });

  return repo;
};
