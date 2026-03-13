import { useCallback, useEffect, useRef, useState } from 'react';

import type { IssueDetail } from '@/ipc/contracts';

type IssueDetailState =
  | { status: 'idle'; data: null; error: null }
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: IssueDetail; error: null }
  | { status: 'error'; data: null; error: string };

export function useIssueDetail(projectPath: string, issueNumber: number | null) {
  const [state, setState] = useState<IssueDetailState>({
    status: 'idle',
    data: null,
    error: null,
  });
  const fetchIdRef = useRef(0);

  const fetch = useCallback(() => {
    if (issueNumber === null) {
      setState({ status: 'idle', data: null, error: null });
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setState({ status: 'loading', data: null, error: null });

    void window.electronAPI
      .getIssueDetail(projectPath, issueNumber)
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
  }, [projectPath, issueNumber]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return state;
}
