import { useCallback, useEffect, useRef, useState } from 'react';

import type { ProjectPullRequestFeed } from '@/ipc/contracts';
import type { ProjectFeedStatus } from '@/renderer/components/project-workspace-feed';

import { useProjectRepoDetailsState } from './use-project-repo';

type ProjectPullRequestsState = ProjectFeedStatus<ProjectPullRequestFeed>;
type ReviewRefsSyncState =
  | { status: 'idle' }
  | { status: 'syncing' }
  | { status: 'ready' }
  | { status: 'error'; error: string };

export function useProjectPullRequests(): ProjectPullRequestsState & {
  isRefetching: boolean;
  refetch: () => void;
  reviewRefsSyncState: ReviewRefsSyncState;
  reviewRefsVersion: number;
  retryReviewRefsSync: () => void;
} {
  const repoDetails = useProjectRepoDetailsState();
  const repoStatus = repoDetails.status;
  const repoError = repoDetails.status === 'error' ? repoDetails.error : null;
  const owner = repoDetails.status === 'ready' ? repoDetails.data.owner : null;
  const name = repoDetails.status === 'ready' ? repoDetails.data.name : null;
  const repoPath = repoDetails.status === 'ready' ? repoDetails.data.path : null;
  const [state, setState] = useState<ProjectPullRequestsState>({
    status: 'loading',
    data: null,
    error: null,
  });
  const [isRefetching, setIsRefetching] = useState(false);
  const [reviewRefsSyncState, setReviewRefsSyncState] = useState<ReviewRefsSyncState>({ status: 'idle' });
  const [reviewRefsVersion, setReviewRefsVersion] = useState(0);
  const fetchIdRef = useRef(0);
  const syncIdRef = useRef(0);

  const fetchPullRequests = useCallback(
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

      void window.electronAPI
        .getProjectPullRequests(owner, name, skipCache)
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
    },
    [name, owner, repoError, repoStatus],
  );

  const syncReviewRefs = useCallback(() => {
    if (repoStatus !== 'ready' || owner === null || name === null || repoPath === null) {
      return;
    }

    const syncId = ++syncIdRef.current;
    setReviewRefsSyncState({ status: 'syncing' });

    void window.electronAPI
      .syncRepoReviewRefs(repoPath, owner, name)
      .then(() => {
        if (syncIdRef.current !== syncId) return;
        setReviewRefsSyncState({ status: 'ready' });
        setReviewRefsVersion((current) => current + 1);
      })
      .catch((error: unknown) => {
        if (syncIdRef.current !== syncId) return;
        setReviewRefsSyncState({
          status: 'error',
          error: error instanceof Error ? error.message : 'Could not sync review refs.',
        });
      });
  }, [name, owner, repoPath, repoStatus]);

  const refetch = useCallback(() => {
    fetchPullRequests(true);
    syncReviewRefs();
  }, [fetchPullRequests, syncReviewRefs]);

  useEffect(() => {
    fetchPullRequests(false);
  }, [fetchPullRequests]);

  useEffect(() => {
    if (repoStatus !== 'ready') {
      syncIdRef.current += 1;
      setReviewRefsSyncState({ status: 'idle' });
      return;
    }

    syncReviewRefs();
  }, [repoStatus, syncReviewRefs]);

  return {
    ...state,
    isRefetching,
    refetch,
    reviewRefsSyncState,
    reviewRefsVersion,
    retryReviewRefsSync: syncReviewRefs,
  };
}
