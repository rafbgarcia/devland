import { useCallback, useEffect, useRef, useState } from 'react';

import type { ProjectPullRequestFeed } from '@/ipc/contracts';
import { useProjectRepoDetailsState } from '@/renderer/hooks/use-project-repo';
import { type ProjectFeedStatus } from '@/renderer/shared/project-feed/project-feed';
import { useProjectFeedState } from '@/renderer/shared/project-feed/use-project-feed-state';

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
  const owner = repoDetails.status === 'ready' ? repoDetails.data.owner : null;
  const name = repoDetails.status === 'ready' ? repoDetails.data.name : null;
  const repoPath = repoDetails.status === 'ready' ? repoDetails.data.path : null;
  const [reviewRefsSyncState, setReviewRefsSyncState] = useState<ReviewRefsSyncState>({
    status: 'idle',
  });
  const [reviewRefsVersion, setReviewRefsVersion] = useState(0);
  const syncIdRef = useRef(0);

  const fetchPullRequests = useCallback(
    ({ owner, name, skipCache }: { owner: string; name: string; skipCache: boolean }) =>
      window.electronAPI.getProjectPullRequests(owner, name, skipCache),
    [],
  );
  const {
    refetch: refetchPullRequests,
    isRefetching,
    ...state
  } = useProjectFeedState({
    fetchFeed: fetchPullRequests,
    errorMessage: 'Could not fetch project pull requests.',
  });

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
    refetchPullRequests();
    syncReviewRefs();
  }, [refetchPullRequests, syncReviewRefs]);

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
