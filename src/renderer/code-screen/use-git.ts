import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';

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
  const inFlightRef = useRef<Promise<void> | null>(null);
  const hasQueuedFetchRef = useRef(false);

  const fetchBranches = useCallback(async () => {
    if (inFlightRef.current) {
      hasQueuedFetchRef.current = true;
      return inFlightRef.current;
    }

    const runFetch = async () => {
      do {
        hasQueuedFetchRef.current = false;
        const fetchId = ++fetchIdRef.current;

        try {
          const branches = await window.electronAPI.getGitBranches(repoPath);

          if (fetchIdRef.current !== fetchId) {
            continue;
          }

          setState({ status: 'ready', data: branches, error: null });
        } catch (error) {
          if (fetchIdRef.current !== fetchId) {
            continue;
          }

          setState({
            status: 'error',
            data: null,
            error: error instanceof Error ? error.message : 'Failed to load branches.',
          });
        }
      } while (hasQueuedFetchRef.current);
    };

    const promise = runFetch().finally(() => {
      inFlightRef.current = null;
    });
    inFlightRef.current = promise;

    return promise;
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
  const inFlightRef = useRef<Promise<void> | null>(null);
  const hasQueuedFetchRef = useRef(false);

  const fetchDefaultBranch = useCallback(async () => {
    if (inFlightRef.current) {
      hasQueuedFetchRef.current = true;
      return inFlightRef.current;
    }

    const runFetch = async () => {
      do {
        hasQueuedFetchRef.current = false;
        const fetchId = ++fetchIdRef.current;

        try {
          const defaultBranch = await window.electronAPI.getGitDefaultBranch(repoPath);

          if (fetchIdRef.current !== fetchId) {
            continue;
          }

          setState({ status: 'ready', data: defaultBranch, error: null });
        } catch (error) {
          if (fetchIdRef.current !== fetchId) {
            continue;
          }

          setState({
            status: 'error',
            data: null,
            error: error instanceof Error ? error.message : 'Failed to load default branch.',
          });
        }
      } while (hasQueuedFetchRef.current);
    };

    const promise = runFetch().finally(() => {
      inFlightRef.current = null;
    });
    inFlightRef.current = promise;

    return promise;
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
  const inFlightRef = useRef<Promise<void> | null>(null);
  const hasQueuedFetchRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    if (inFlightRef.current) {
      hasQueuedFetchRef.current = true;
      return inFlightRef.current;
    }

    const runFetch = async () => {
      do {
        hasQueuedFetchRef.current = false;
        const fetchId = ++fetchIdRef.current;

        try {
          const gitStatus = await window.electronAPI.getGitStatus(repoPath);

          if (fetchIdRef.current !== fetchId) {
            continue;
          }

          setState({ status: 'ready', data: gitStatus, error: null });
        } catch (error) {
          if (fetchIdRef.current !== fetchId) {
            continue;
          }

          setState({
            status: 'error',
            data: null,
            error: error instanceof Error ? error.message : 'Failed to load status.',
          });
        }
      } while (hasQueuedFetchRef.current);
    };

    const promise = runFetch().finally(() => {
      inFlightRef.current = null;
    });
    inFlightRef.current = promise;

    return promise;
  }, [repoPath]);

  useEffect(() => {
    setState({ status: 'loading', data: null, error: null });
    void fetchStatus();
  }, [fetchStatus]);

  return { ...state, refetch: fetchStatus };
}

export function useGitStateWatch(
  repoPaths: readonly string[],
  onGitStateChange: (repoPath: string) => void,
) {
  const handleGitStateChange = useEffectEvent(onGitStateChange);
  const repoPathsKey = [...new Set(repoPaths.filter((repoPath) => repoPath.trim().length > 0))]
    .sort()
    .join('\0');

  useEffect(() => {
    const uniqueRepoPaths = repoPathsKey.length === 0
      ? []
      : repoPathsKey.split('\0');

    if (uniqueRepoPaths.length === 0) {
      return;
    }

    let cancelled = false;
    const subscriptionIds: string[] = [];
    const unsubscribeFromEvents = window.electronAPI.onGitStateChanged((event) => {
      if (!uniqueRepoPaths.includes(event.repoPath)) {
        return;
      }

      handleGitStateChange(event.repoPath);
    });

    const startWatching = async () => {
      for (const repoPath of uniqueRepoPaths) {
        try {
          const subscriptionId = await window.electronAPI.startGitStateWatch(repoPath);

          if (cancelled) {
            await window.electronAPI.stopGitStateWatch(subscriptionId);
            continue;
          }

          subscriptionIds.push(subscriptionId);
        } catch (error) {
          console.error('Failed to start Git state watch:', error);
        }
      }
    };

    void startWatching();

    return () => {
      cancelled = true;
      unsubscribeFromEvents();

      for (const subscriptionId of subscriptionIds) {
        void window.electronAPI.stopGitStateWatch(subscriptionId).catch((error) => {
          console.error('Failed to stop Git state watch:', error);
        });
      }
    };
  }, [repoPathsKey]);
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
