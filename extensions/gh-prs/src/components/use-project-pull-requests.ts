import { useCallback, useEffect, useRef, useState } from 'react';

import type { DevlandRepoContext } from '@devlandapp/sdk';

import { getProjectPullRequests } from '@/pull-requests/api';
import type { ProjectPullRequestFeed } from '@/pull-requests/contracts';

type ProjectPullRequestsState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: ProjectPullRequestFeed; error: null }
  | { status: 'error'; data: null; error: string };

export function useProjectPullRequests(repo: DevlandRepoContext) {
  const [state, setState] = useState<ProjectPullRequestsState>({
    status: 'loading',
    data: null,
    error: null,
  });
  const [isRefetching, setIsRefetching] = useState(false);
  const fetchIdRef = useRef(0);

  const loadFeed = useCallback((skipCache: boolean) => {
    const fetchId = ++fetchIdRef.current;

    if (skipCache) {
      setIsRefetching(true);
    } else {
      setState({ status: 'loading', data: null, error: null });
    }

    void getProjectPullRequests(repo, skipCache)
      .then((data) => {
        if (fetchIdRef.current !== fetchId) return;
        setState({ status: 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (fetchIdRef.current !== fetchId) return;
        setState({
          status: 'error',
          data: null,
          error:
            error instanceof Error
              ? error.message
              : 'Could not fetch project pull requests.',
        });
      })
      .finally(() => {
        if (fetchIdRef.current !== fetchId) return;
        setIsRefetching(false);
      });
  }, [repo.name, repo.owner]);

  const refetch = useCallback(() => {
    loadFeed(true);
  }, [loadFeed]);

  useEffect(() => {
    loadFeed(false);
  }, [loadFeed]);

  return {
    ...state,
    isRefetching,
    refetch,
  };
}
