import { useCallback, useEffect, useRef, useState } from 'react';

import type { ProjectFeed } from '@/ipc/contracts';
import { useProjectRepoDetailsState } from '@/renderer/projects-shell/use-project-repo';

import type { ProjectFeedStatus } from './project-feed';

type ProjectFeedFetcher<TFeed extends ProjectFeed> = (args: {
  owner: string;
  name: string;
  skipCache: boolean;
}) => Promise<TFeed>;

export function useProjectFeedState<TFeed extends ProjectFeed>({
  fetchFeed,
  errorMessage,
}: {
  fetchFeed: ProjectFeedFetcher<TFeed>;
  errorMessage: string;
}): ProjectFeedStatus<TFeed> & {
  isRefetching: boolean;
  refetch: () => void;
} {
  const repoDetails = useProjectRepoDetailsState();
  const repoStatus = repoDetails.status;
  const repoError = repoDetails.status === 'error' ? repoDetails.error : null;
  const owner = repoDetails.status === 'ready' ? repoDetails.data.owner : null;
  const name = repoDetails.status === 'ready' ? repoDetails.data.name : null;
  const [state, setState] = useState<ProjectFeedStatus<TFeed>>({
    status: 'loading',
    data: null,
    error: null,
  });
  const [isRefetching, setIsRefetching] = useState(false);
  const fetchIdRef = useRef(0);

  const loadFeed = useCallback(
    (skipCache: boolean) => {
      if (repoStatus === 'idle' || repoStatus === 'loading') {
        fetchIdRef.current += 1;
        if (!skipCache) {
          setState({ status: 'loading', data: null, error: null });
        }
        setIsRefetching(false);
        return;
      }

      if (repoStatus === 'error') {
        fetchIdRef.current += 1;
        setState({
          status: 'error',
          data: null,
          error: repoError ?? 'Could not resolve repository details.',
        });
        setIsRefetching(false);
        return;
      }

      if (owner === null || name === null) {
        return;
      }

      const fetchId = ++fetchIdRef.current;

      if (skipCache) {
        setIsRefetching(true);
      } else {
        setState({ status: 'loading', data: null, error: null });
      }

      void fetchFeed({ owner, name, skipCache })
        .then((data) => {
          if (fetchIdRef.current !== fetchId) return;
          setState({ status: 'ready', data, error: null });
        })
        .catch((error: unknown) => {
          if (fetchIdRef.current !== fetchId) return;
          setState({
            status: 'error',
            data: null,
            error: error instanceof Error ? error.message : errorMessage,
          });
        })
        .finally(() => {
          if (fetchIdRef.current !== fetchId) return;
          setIsRefetching(false);
        });
    },
    [errorMessage, fetchFeed, name, owner, repoError, repoStatus],
  );

  const refetch = useCallback(() => {
    loadFeed(true);
  }, [loadFeed]);

  useEffect(() => {
    loadFeed(false);
  }, [loadFeed]);

  return { ...state, isRefetching, refetch };
}
