import { useCallback, useEffect, useRef, useState } from 'react';

import type { IssueDetail } from '@/ipc/contracts';

import { useProjectRepoDetailsState } from './use-project-repo';

type IssueDetailState =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: IssueDetail; error: null }
  | { status: 'error'; data: null; error: string };

export function useIssueDetail(issueNumber: number | null) {
  const repoDetails = useProjectRepoDetailsState();
  const repoStatus = repoDetails.status;
  const repoError = repoDetails.status === 'error' ? repoDetails.error : null;
  const owner = repoDetails.status === 'ready' ? repoDetails.data.owner : null;
  const name = repoDetails.status === 'ready' ? repoDetails.data.name : null;
  const [state, setState] = useState<IssueDetailState>({
    status: 'idle',
    data: null,
    error: null,
  });
  const fetchIdRef = useRef(0);

  const fetch = useCallback(() => {
    if (issueNumber === null) {
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
      .getIssueDetail(owner, name, issueNumber)
      .then((data) => {
        if (fetchIdRef.current !== fetchId) return;
        setState({ status: 'ready', data, error: null });
      })
      .catch((error: unknown) => {
        if (fetchIdRef.current !== fetchId) return;
        setState({
          status: 'error',
          data: null,
          error: error instanceof Error ? error.message : 'Could not load issue details.',
        });
      });
  }, [issueNumber, name, owner, repoError, repoStatus]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return state;
}
