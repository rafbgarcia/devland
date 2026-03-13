import { useCallback, useEffect, useRef, useState } from 'react';

import type { PullRequestDetail } from '@/ipc/contracts';

import { useProjectRepoDetailsState } from './use-project-repo';

type PullRequestDetailState =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: PullRequestDetail; error: null }
  | { status: 'error'; data: null; error: string };

export function usePullRequestDetail(prNumber: number | null) {
  const repoDetails = useProjectRepoDetailsState();
  const repoStatus = repoDetails.status;
  const repoError = repoDetails.status === 'error' ? repoDetails.error : null;
  const owner = repoDetails.status === 'ready' ? repoDetails.data.owner : null;
  const name = repoDetails.status === 'ready' ? repoDetails.data.name : null;
  const [state, setState] = useState<PullRequestDetailState>({
    status: 'idle',
    data: null,
    error: null,
  });
  const fetchIdRef = useRef(0);

  const fetch = useCallback(() => {
    if (prNumber === null) {
      fetchIdRef.current += 1;
      setState({ status: 'idle', data: null, error: null });
      return;
    }

    if (repoStatus === 'idle' || repoStatus === 'loading') {
      fetchIdRef.current += 1;
      setState({ status: 'loading', data: null, error: null });
      return;
    }

    if (repoStatus === 'error') {
      fetchIdRef.current += 1;
      setState({
        status: 'error',
        data: null,
        error: repoError ?? 'Could not resolve repository details.',
      });
      return;
    }

    if (owner === null || name === null) {
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setState({ status: 'loading', data: null, error: null });

    void window.electronAPI
      .getPullRequestDetail(owner, name, prNumber)
      .then((data) => {
        if (fetchIdRef.current !== fetchId) return;
        setState({ status: 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (fetchIdRef.current !== fetchId) return;
        setState({
          status: 'error',
          data: null,
          error: error instanceof Error ? error.message : 'Could not load pull request details.',
        });
      });
  }, [prNumber, name, owner, repoError, repoStatus]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return state;
}
