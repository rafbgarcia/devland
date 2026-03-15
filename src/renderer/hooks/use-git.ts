import { useCallback, useEffect, useRef, useState } from 'react';

import type { GitBranch, GitStatus } from '@/ipc/contracts';

type AsyncState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: string };

export function useGitBranches(repoPath: string) {
  const [state, setState] = useState<AsyncState<GitBranch[]>>({
    status: 'loading',
    data: null,
    error: null,
  });
  const fetchIdRef = useRef(0);

  const fetchBranches = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;

    try {
      const branches = await window.electronAPI.getGitBranches(repoPath);

      if (fetchIdRef.current !== fetchId) return;

      setState({ status: 'ready', data: branches, error: null });
    } catch (error) {
      if (fetchIdRef.current !== fetchId) return;

      setState({
        status: 'error',
        data: null,
        error: error instanceof Error ? error.message : 'Failed to load branches.',
      });
    }
  }, [repoPath]);

  useEffect(() => {
    setState({ status: 'loading', data: null, error: null });
    void fetchBranches();
  }, [fetchBranches]);

  return { ...state, refetch: fetchBranches };
}

export function useGitDefaultBranch(repoPath: string) {
  const [state, setState] = useState<AsyncState<string>>({
    status: 'loading',
    data: null,
    error: null,
  });
  const fetchIdRef = useRef(0);

  const fetchDefaultBranch = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;

    try {
      const defaultBranch = await window.electronAPI.getGitDefaultBranch(repoPath);

      if (fetchIdRef.current !== fetchId) return;

      setState({ status: 'ready', data: defaultBranch, error: null });
    } catch (error) {
      if (fetchIdRef.current !== fetchId) return;

      setState({
        status: 'error',
        data: null,
        error: error instanceof Error ? error.message : 'Failed to load default branch.',
      });
    }
  }, [repoPath]);

  useEffect(() => {
    setState({ status: 'loading', data: null, error: null });
    void fetchDefaultBranch();
  }, [fetchDefaultBranch]);

  return { ...state, refetch: fetchDefaultBranch };
}

export function useGitStatus(repoPath: string) {
  const [state, setState] = useState<AsyncState<GitStatus>>({
    status: 'loading',
    data: null,
    error: null,
  });
  const fetchIdRef = useRef(0);

  const fetchStatus = useCallback(async () => {
    const fetchId = ++fetchIdRef.current;

    try {
      const gitStatus = await window.electronAPI.getGitStatus(repoPath);

      if (fetchIdRef.current !== fetchId) return;

      setState({ status: 'ready', data: gitStatus, error: null });
    } catch (error) {
      if (fetchIdRef.current !== fetchId) return;

      setState({
        status: 'error',
        data: null,
        error: error instanceof Error ? error.message : 'Failed to load status.',
      });
    }
  }, [repoPath]);

  useEffect(() => {
    setState({ status: 'loading', data: null, error: null });
    void fetchStatus();
  }, [fetchStatus]);

  return { ...state, refetch: fetchStatus };
}

export function useGitFileDiff(repoPath: string, filePath: string | null) {
  const [state, setState] = useState<AsyncState<string>>({
    status: 'loading',
    data: null,
    error: null,
  });
  const fetchIdRef = useRef(0);
  const fetchDiff = useCallback(async () => {
    if (filePath === null) {
      fetchIdRef.current += 1;
      setState({ status: 'loading', data: null, error: null });

      return;
    }

    const fetchId = ++fetchIdRef.current;

    setState({ status: 'loading', data: null, error: null });

    try {
      const diff = await window.electronAPI.getGitFileDiff(repoPath, filePath);

      if (fetchIdRef.current !== fetchId) return;

      setState({ status: 'ready', data: diff, error: null });
    } catch (error) {
      if (fetchIdRef.current !== fetchId) return;

      setState({
        status: 'error',
        data: null,
        error: error instanceof Error ? error.message : 'Failed to load diff.',
      });
    }
  }, [filePath, repoPath]);

  useEffect(() => {
    void fetchDiff();
  }, [fetchDiff]);

  return { ...state, refetch: fetchDiff };
}
