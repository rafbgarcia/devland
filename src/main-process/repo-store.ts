import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';

import type { Repo } from '../ipc/contracts';
import { isAbsoluteRepoPath } from './git';

const STORE_DIRECTORY_NAME = 'state';
const STORE_FILE_NAME = 'repos.json';

type PersistedRepoState = {
  version: 2;
  repos: Repo[];
};

const DEFAULT_REPO_STATE: PersistedRepoState = {
  version: 2,
  repos: [],
};

type ParsedRepoState = {
  state: PersistedRepoState;
  didMigrate: boolean;
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

const createRepo = (repoPath: string): Repo => ({
  id: nanoid(),
  path: repoPath,
});

const parsePersistedRepoState = (value: unknown): ParsedRepoState => {
  if (!isRecord(value) || !Array.isArray(value.repos)) {
    return {
      state: DEFAULT_REPO_STATE,
      didMigrate: false,
    };
  }

  const repos: Repo[] = [];
  const seenRepoKeys = new Set<string>();
  let didMigrate = value.version !== 2;

  for (const candidate of value.repos) {
    if (!isRecord(candidate) || typeof candidate.path !== 'string') {
      didMigrate = true;
      continue;
    }

    const normalizedPath = candidate.path.trim();

    if (!normalizedPath) {
      didMigrate = true;
      continue;
    }

    const repoKey = getRepoKey(normalizedPath);

    if (seenRepoKeys.has(repoKey)) {
      didMigrate = true;
      continue;
    }

    seenRepoKeys.add(repoKey);

    if (typeof candidate.id === 'string' && candidate.id.trim() !== '') {
      repos.push({ id: candidate.id, path: normalizedPath });
      continue;
    }

    repos.push(createRepo(normalizedPath));
    didMigrate = true;
  }

  return {
    state: {
      version: 2,
      repos,
    },
    didMigrate,
  };
};

const readPersistedRepoState = async (): Promise<PersistedRepoState> => {
  try {
    const fileContents = await readFile(getStoreFilePath(), 'utf8');
    const parsedValue = JSON.parse(fileContents) as unknown;
    const parsedState = parsePersistedRepoState(parsedValue);

    if (parsedState.didMigrate) {
      await writePersistedRepoState(parsedState.state);
    }

    return parsedState.state;
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

export const removeRepoById = async (repoId: string): Promise<void> => {
  const persistedState = await readPersistedRepoState();

  await writePersistedRepoState({
    version: 2,
    repos: persistedState.repos.filter((repo) => repo.id !== repoId),
  });
};

export const reorderRepoIds = async (orderedRepoIds: string[]): Promise<void> => {
  const persistedState = await readPersistedRepoState();
  const reposById = new Map(persistedState.repos.map((repo) => [repo.id, repo]));

  if (orderedRepoIds.length !== persistedState.repos.length) {
    throw new Error('Could not reorder repositories because the submitted order is incomplete.');
  }

  const reorderedRepos = orderedRepoIds.map((repoId) => {
    const repo = reposById.get(repoId);

    if (repo === undefined) {
      throw new Error(`Could not reorder repositories because "${repoId}" does not exist.`);
    }

    return repo;
  });

  await writePersistedRepoState({
    version: 2,
    repos: reorderedRepos,
  });
};

export const saveRepoPath = async (repoPath: string): Promise<Repo> => {
  const persistedState = await readPersistedRepoState();
  const repoKey = getRepoKey(repoPath);
  const existingRepo = persistedState.repos.find(
    (repo) => getRepoKey(repo.path) === repoKey,
  );

  if (existingRepo) {
    return existingRepo;
  }

  const repo = createRepo(repoPath);

  await writePersistedRepoState({
    version: 2,
    repos: [...persistedState.repos, repo],
  });

  return repo;
};
