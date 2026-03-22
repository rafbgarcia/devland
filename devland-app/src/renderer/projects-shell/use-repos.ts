import { useCallback } from 'react';

import { getRouteApi } from '@tanstack/react-router';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import type { Repo } from '@/ipc/contracts';
import {
  getProjectStorageKey,
  isAbsoluteProjectPath,
  isGitHubProjectReference,
  normalizeProjectInput,
} from '@/renderer/shared/lib/projects';

const rootRouteApi = getRouteApi('__root__');

const STORAGE_KEY = 'devland:repos';

const storedReposAtom = atomWithStorage<Repo[]>(STORAGE_KEY, []);

const sanitizeRepos = (value: unknown): Repo[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const repos: Repo[] = [];
  const seenRepoKeys = new Set<string>();

  for (const candidate of value) {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      typeof candidate.id !== 'string' ||
      candidate.id.trim() === '' ||
      typeof candidate.path !== 'string'
    ) {
      continue;
    }

    const path = candidate.path.trim();

    if (!path) {
      continue;
    }

    const repoKey = getProjectStorageKey(path);

    if (seenRepoKeys.has(repoKey)) {
      continue;
    }

    seenRepoKeys.add(repoKey);
    repos.push({ id: candidate.id, path });
  }

  return repos;
};

export const reposAtom = atom<Repo[]>((get) => sanitizeRepos(get(storedReposAtom)));

const setReposAtom = atom(
  null,
  (get, set, nextRepos: Repo[] | ((repos: Repo[]) => Repo[])) => {
    const resolvedRepos =
      typeof nextRepos === 'function' ? nextRepos(get(reposAtom)) : nextRepos;

    set(storedReposAtom, sanitizeRepos(resolvedRepos));
  },
);

export function useRepos() {
  return useAtomValue(reposAtom);
}

export function useRepoActions() {
  const repos = useRepos();
  const setRepos = useSetAtom(setReposAtom);
  const { ghCliAvailable } = rootRouteApi.useLoaderData();

  const addRepo = useCallback(
    async (candidatePath: string) => {
      const normalizedProjectInput = normalizeProjectInput(candidatePath);

      if (!ghCliAvailable && isGitHubProjectReference(normalizedProjectInput)) {
        throw new Error(
          'GitHub CLI is not installed. Install gh and run `gh auth login` to add remote repositories.',
        );
      }

      const projectPath = isGitHubProjectReference(normalizedProjectInput)
        ? (
            await window.electronAPI.findLocalGithubRepoPath(normalizedProjectInput)
          ) ?? normalizedProjectInput
        : normalizedProjectInput;

      if (isAbsoluteProjectPath(projectPath)) {
        try {
          await window.electronAPI.validateLocalGitRepository(projectPath);
        } catch (error) {
          throw new Error(
            error instanceof Error
              ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
              : 'Please select a Git repository.',
            { cause: error },
          );
        }
      }

      const repoKey = getProjectStorageKey(projectPath);
      const existingRepo = repos.find(
        (repo) => getProjectStorageKey(repo.path) === repoKey,
      );

      if (existingRepo !== undefined) {
        return existingRepo;
      }

      const repo = {
        id: crypto.randomUUID(),
        path: projectPath,
      } satisfies Repo;

      setRepos((currentRepos) => {
        if (
          currentRepos.some(
            (currentRepo) => getProjectStorageKey(currentRepo.path) === repoKey,
          )
        ) {
          return currentRepos;
        }

        return [...currentRepos, repo];
      });

      return repo;
    },
    [repos, setRepos],
  );

  const removeRepo = useCallback(
    (repoId: string) => {
      setRepos((currentRepos) =>
        currentRepos.filter((repo) => repo.id !== repoId),
      );
    },
    [setRepos],
  );

  const updateRepoPath = useCallback(
    (repoId: string, newPath: string) => {
      setRepos((currentRepos) =>
        currentRepos.map((repo) =>
          repo.id === repoId ? { ...repo, path: newPath } : repo,
        ),
      );
    },
    [setRepos],
  );

  const reorderRepos = useCallback(
    (orderedRepos: Repo[]) => {
      setRepos(orderedRepos);
    },
    [setRepos],
  );

  return {
    addRepo,
    removeRepo,
    updateRepoPath,
    reorderRepos,
  };
}
