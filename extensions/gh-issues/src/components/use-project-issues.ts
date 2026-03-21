import { useCallback, useEffect, useRef, useState } from 'react';

import type { DevlandRepoContext } from '@devlandapp/sdk';

import { getProjectIssues } from '@/issues/api';
import type { ProjectIssueFeed } from '@/issues/contracts';

type ProjectIssuesState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: ProjectIssueFeed; error: null }
  | { status: 'error'; data: null; error: string };

export function useProjectIssues(repo: DevlandRepoContext) {
  const [state, setState] = useState<ProjectIssuesState>({
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

    void getProjectIssues(repo, skipCache)
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
              : 'Could not fetch project issues.',
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
