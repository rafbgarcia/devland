import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ProjectFeed,
  ProjectFeedKind,
  ProjectIssueFeed,
  ProjectPullRequestFeed,
} from '@/ipc/contracts';
import type { ProjectFeedStatus } from '@/renderer/components/project-workspace-feed';

type ProjectFeedState<TFeed extends ProjectFeed> = ProjectFeedStatus<TFeed>;

function fetchFeed(
  projectPath: string,
  kind: 'issues',
  skipCache?: boolean,
): Promise<ProjectIssueFeed>;
function fetchFeed(
  projectPath: string,
  kind: 'pull-requests',
  skipCache?: boolean,
): Promise<ProjectPullRequestFeed>;
function fetchFeed(
  projectPath: string,
  kind: ProjectFeedKind,
  skipCache?: boolean,
): Promise<ProjectFeed>;
function fetchFeed(
  projectPath: string,
  kind: ProjectFeedKind,
  skipCache?: boolean,
): Promise<ProjectFeed> {
  if (kind === 'issues') {
    return window.electronAPI.getProjectIssues(projectPath, skipCache);
  }

  return window.electronAPI.getProjectPullRequests(projectPath, skipCache);
}

export function useProjectFeed(
  projectPath: string | null,
  kind: 'issues',
): ProjectFeedState<ProjectIssueFeed> & { isRefetching: boolean; refetch: () => void };
export function useProjectFeed(
  projectPath: string | null,
  kind: 'pull-requests',
): ProjectFeedState<ProjectPullRequestFeed> & { isRefetching: boolean; refetch: () => void };
export function useProjectFeed(
  projectPath: string | null,
  kind: ProjectFeedKind,
): ProjectFeedState<ProjectFeed> & { isRefetching: boolean; refetch: () => void } {
  const [state, setState] = useState<ProjectFeedState<ProjectFeed>>({
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
}
