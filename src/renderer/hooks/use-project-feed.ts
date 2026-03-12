import { useCallback, useEffect, useRef, useState } from 'react';

import type { ProjectFeedKind, ProjectFeed } from '@/ipc/contracts';

type ProjectFeedState =
  | {
      status: 'loading';
      data: null;
      error: null;
    }
  | {
      status: 'ready';
      data: ProjectFeed;
      error: null;
    }
  | {
      status: 'error';
      data: null;
      error: string;
    };

const fetchFeed = (projectPath: string, kind: ProjectFeedKind, skipCache?: boolean) => {
  if (kind === 'issues') {
    return window.electronAPI.getProjectIssues(projectPath, skipCache);
  }

  return window.electronAPI.getProjectPullRequests(projectPath, skipCache);
};

export const useProjectFeed = (
  projectPath: string | null,
  kind: ProjectFeedKind,
): ProjectFeedState & { isRefetching: boolean; refetch: () => void } => {
  const [state, setState] = useState<ProjectFeedState>({
    status: 'loading',
    data: null,
    error: null,
  });
  const [isRefetching, setIsRefetching] = useState(false);
  const refetchCounter = useRef(0);

  const refetch = useCallback(() => {
    refetchCounter.current += 1;
    doFetch(true);
  }, [projectPath, kind]);

  const doFetch = useCallback(
    (skipCache: boolean) => {
      if (projectPath === null) {
        setState({ status: 'error', data: null, error: 'Choose a project first.' });
        return;
      }

      const fetchId = ++refetchCounter.current;

      if (skipCache) {
        setIsRefetching(true);
      } else {
        setState({ status: 'loading', data: null, error: null });
      }

      void fetchFeed(projectPath, kind, skipCache)
        .then((data) => {
          if (refetchCounter.current !== fetchId) return;
          setState({ status: 'ready', data, error: null });
        })
        .catch((error: unknown) => {
          if (refetchCounter.current !== fetchId) return;
          setState({
            status: 'error',
            data: null,
            error: error instanceof Error ? error.message : 'Could not fetch project data.',
          });
        })
        .finally(() => {
          if (refetchCounter.current !== fetchId) return;
          setIsRefetching(false);
        });
    },
    [projectPath, kind],
  );

  useEffect(() => {
    refetchCounter.current += 1;
    doFetch(false);
  }, [doFetch]);

  return { ...state, isRefetching, refetch };
};
