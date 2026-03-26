import { useEffect, useMemo, useState } from 'react';

import type { ProjectExtension } from '@/extensions/contracts';
import type { Repo } from '@/ipc/contracts';
import {
  clearProjectExtensionsCache,
  getCachedProjectExtensions,
  loadProjectExtensions,
  type ProjectExtensionsState,
} from './use-project-extensions';

/**
 * Loads and caches extensions for every repo keyed by repo path.
 * Repo entries remain stable across project switches, so extension tabs do not disappear
 * while another repo becomes active.
 */
export function useAllProjectExtensions(repos: Repo[]) {
  const repoPaths = useMemo(
    () => repos.map((repo) => repo.path),
    [repos],
  );
  const [stateByRepoPath, setStateByRepoPath] = useState<Record<string, ProjectExtensionsState>>(
    () =>
      Object.fromEntries(
        repoPaths.map((repoPath) => [
          repoPath,
          {
            status: 'ready',
            data: getCachedProjectExtensions(repoPath) ?? [],
            error: null,
          } satisfies ProjectExtensionsState,
        ]),
      ),
  );

  useEffect(() => {
    let cancelled = false;

    setStateByRepoPath((currentState) => {
      const nextState: Record<string, ProjectExtensionsState> = {};

      for (const repoPath of repoPaths) {
        nextState[repoPath] = currentState[repoPath] ?? {
          status: 'ready',
          data: getCachedProjectExtensions(repoPath) ?? [],
          error: null,
        };
      }

      return nextState;
    });

    for (const repoPath of repoPaths) {
      const cachedExtensions = getCachedProjectExtensions(repoPath);

      if (cachedExtensions !== undefined) {
        setStateByRepoPath((currentState) => {
          const currentRepoState = currentState[repoPath];

          if (
            currentRepoState?.status === 'ready'
            && currentRepoState.data === cachedExtensions
            && currentRepoState.error === null
          ) {
            return currentState;
          }

          return {
            ...currentState,
            [repoPath]: {
              status: 'ready',
              data: cachedExtensions,
              error: null,
            },
          };
        });
        continue;
      }

      setStateByRepoPath((currentState) => {
        const currentRepoState = currentState[repoPath];

        if (currentRepoState?.status === 'loading') {
          return currentState;
        }

        return {
          ...currentState,
          [repoPath]: {
            status: 'loading',
            data: currentRepoState?.data ?? [],
            error: null,
          },
        };
      });

      void loadProjectExtensions(repoPath)
        .then((extensions) => {
          if (cancelled) {
            return;
          }

          setStateByRepoPath((currentState) => ({
            ...currentState,
            [repoPath]: {
              status: 'ready',
              data: extensions,
              error: null,
            },
          }));
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          setStateByRepoPath((currentState) => ({
            ...currentState,
            [repoPath]: {
              status: 'error',
              data: currentState[repoPath]?.data ?? [],
              error:
                error instanceof Error
                  ? error.message
                  : 'Could not load project extensions.',
            },
          }));
        });
    }

    return () => {
      cancelled = true;
    };
  }, [repoPaths]);

  const refresh = async (repoPath: string): Promise<void> => {
    clearProjectExtensionsCache(repoPath);

    setStateByRepoPath((currentState) => ({
      ...currentState,
      [repoPath]: {
        status: 'loading',
        data: currentState[repoPath]?.data ?? [],
        error: null,
      },
    }));

    try {
      const extensions = await loadProjectExtensions(repoPath);

      setStateByRepoPath((currentState) => ({
        ...currentState,
        [repoPath]: {
          status: 'ready',
          data: extensions,
          error: null,
        },
      }));
    } catch (error) {
      setStateByRepoPath((currentState) => ({
        ...currentState,
        [repoPath]: {
          status: 'error',
          data: currentState[repoPath]?.data ?? [],
          error:
            error instanceof Error
              ? error.message
              : 'Could not load project extensions.',
        },
      }));
    }
  };

  return {
    getExtensions(repoPath: string): readonly ProjectExtension[] {
      return stateByRepoPath[repoPath]?.data ?? [];
    },
    refresh,
  };
}
