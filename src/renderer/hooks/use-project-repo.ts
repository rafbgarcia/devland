import { useEffect } from 'react';

import { useParams } from '@tanstack/react-router';
import { atom, useAtomValue, useSetAtom } from 'jotai';

import type { Repo, RepoDetails } from '@/ipc/contracts';

import { reposAtom } from './use-repos';

type RepoMetadata = Pick<RepoDetails, 'githubSlug' | 'owner' | 'name'>;

export type ProjectRepo = Repo & RepoMetadata;

type RepoMetadataState =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: RepoMetadata; error: null }
  | { status: 'error'; data: null; error: string };

const repoMetadataByIdAtom = atom<Record<string, RepoMetadataState>>({});

const loadRepoMetadataAtom = atom(null, async (get, set, repo: Repo) => {
  const repoMetadataById = get(repoMetadataByIdAtom);
  const currentRepoMetadata = repoMetadataById[repo.id];

  if (
    currentRepoMetadata?.status === 'loading' ||
    currentRepoMetadata?.status === 'ready'
  ) {
    return;
  }

  set(repoMetadataByIdAtom, {
    ...repoMetadataById,
    [repo.id]: { status: 'loading', data: null, error: null },
  });

  try {
    const { githubSlug, owner, name } = await window.electronAPI.getGithubRepoDetails(repo.path);

    set(repoMetadataByIdAtom, {
      ...get(repoMetadataByIdAtom),
      [repo.id]: {
        status: 'ready',
        data: { githubSlug, owner, name },
        error: null,
      },
    });
  } catch (error) {
    set(repoMetadataByIdAtom, {
      ...get(repoMetadataByIdAtom),
      [repo.id]: {
        status: 'error',
        data: null,
        error:
          error instanceof Error
            ? error.message
            : 'Could not resolve repository details.',
      },
    });
  }
});

type ProjectRepoDetailsState =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: ProjectRepo; error: null }
  | { status: 'error'; data: null; error: string };

export function useProjectRepoId(): string | null {
  return (
    useParams({
      strict: false,
      shouldThrow: false,
      select: (params) => params.repoId ?? null,
    }) ?? null
  );
}

export function useProjectRepo(): Repo | null {
  const repoId = useProjectRepoId();
  const repos = useAtomValue(reposAtom);

  if (repoId === null) {
    return null;
  }

  return repos.find((repo) => repo.id === repoId) ?? null;
}

export function useProjectRepoDetailsState(): ProjectRepoDetailsState {
  const repo = useProjectRepo();
  const repoMetadataById = useAtomValue(repoMetadataByIdAtom);
  const loadRepoMetadata = useSetAtom(loadRepoMetadataAtom);

  useEffect(() => {
    if (repo === null) {
      return;
    }

    void loadRepoMetadata(repo);
  }, [repo, loadRepoMetadata]);

  if (repo === null) {
    return { status: 'idle', data: null, error: null };
  }

  const repoMetadataState = repoMetadataById[repo.id];

  if (repoMetadataState?.status === 'ready') {
    return {
      status: 'ready',
      data: {
        ...repo,
        ...repoMetadataState.data,
      },
      error: null,
    };
  }

  if (
    repoMetadataState === undefined ||
    repoMetadataState.status === 'idle' ||
    repoMetadataState.status === 'loading'
  ) {
    return { status: 'loading', data: null, error: null };
  }

  return {
    status: 'error',
    data: null,
    error: repoMetadataState.error ?? 'Could not resolve repository details.',
  };
}
