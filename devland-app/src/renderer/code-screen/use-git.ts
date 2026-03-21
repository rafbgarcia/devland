import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import type { GitBranch, GitStatus } from '@/ipc/contracts';
import { createCoalescedTaskRunner } from '@/renderer/shared/lib/coalesced-request';
import { incrementDevPerformanceCounter } from '@/renderer/shared/lib/dev-performance';

type AsyncState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: string };

type ScopedAsyncState<T> = AsyncState<T> & {
  repoPath: string;
  refreshVersion: number;
};

type GitAsyncMetricKey =
  | 'gitBranchesFetch'
  | 'gitDefaultBranchFetch'
  | 'gitStatusFetch';

export function getVisibleGitAsyncState<T>(
  repoPath: string,
  state: ScopedAsyncState<T>,
): ScopedAsyncState<T> {
  if (state.repoPath === repoPath) {
    return state;
  }

  return {
    repoPath,
    status: 'loading',
    data: null,
    error: null,
    refreshVersion: 0,
  };
}

function useCoalescedGitAsyncState<T>({
  repoPath,
  load,
  errorMessage,
  metricsKey,
}: {
  repoPath: string;
  load: (repoPath: string) => Promise<T>;
  errorMessage: string;
  metricsKey: GitAsyncMetricKey;
}) {
  const [state, setState] = useState<ScopedAsyncState<T>>({
    repoPath,
    status: 'loading',
    data: null,
    error: null,
    refreshVersion: 0,
  });
  const fetchIdRef = useRef(0);
  const runner = useMemo(() => createCoalescedTaskRunner(), [repoPath]);

  const fetchValue = useCallback(async () => {
    return runner.run(async () => {
      const currentRepoPath = repoPath;
      const fetchId = ++fetchIdRef.current;
      incrementDevPerformanceCounter(`${metricsKey}Started`);

      try {
        const value = await load(repoPath);

        if (fetchIdRef.current !== fetchId) {
          return;
        }

        setState((current) => ({
          repoPath: currentRepoPath,
          status: 'ready',
          data: value,
          error: null,
          refreshVersion:
            current.repoPath === currentRepoPath ? current.refreshVersion + 1 : 1,
        }));
      } catch (error) {
        if (fetchIdRef.current !== fetchId) {
          return;
        }

        setState({
          repoPath: currentRepoPath,
          status: 'error',
          data: null,
          error: error instanceof Error ? error.message : errorMessage,
          refreshVersion: 0,
        });
      } finally {
        incrementDevPerformanceCounter(`${metricsKey}Completed`);
      }
    });
  }, [errorMessage, load, metricsKey, repoPath, runner]);

  useEffect(() => {
    setState({
      repoPath,
      status: 'loading',
      data: null,
      error: null,
      refreshVersion: 0,
    });
    void fetchValue();
  }, [fetchValue]);

  return { ...getVisibleGitAsyncState(repoPath, state), refetch: fetchValue };
}

export function useGitBranches(repoPath: string) {
  const loadBranches = useCallback(
    (currentRepoPath: string) => window.electronAPI.getGitBranches(currentRepoPath),
    [],
  );

  return useCoalescedGitAsyncState<GitBranch[]>({
    repoPath,
    load: loadBranches,
    errorMessage: 'Failed to load branches.',
    metricsKey: 'gitBranchesFetch',
  });
}

export function useGitDefaultBranch(repoPath: string) {
  const loadDefaultBranch = useCallback(
    (currentRepoPath: string) => window.electronAPI.getGitDefaultBranch(currentRepoPath),
    [],
  );

  return useCoalescedGitAsyncState<string>({
    repoPath,
    load: loadDefaultBranch,
    errorMessage: 'Failed to load default branch.',
    metricsKey: 'gitDefaultBranchFetch',
  });
}

export function useGitStatus(repoPath: string) {
  const loadStatus = useCallback(
    (currentRepoPath: string) => window.electronAPI.getGitStatus(currentRepoPath),
    [],
  );

  return useCoalescedGitAsyncState<GitStatus>({
    repoPath,
    load: loadStatus,
    errorMessage: 'Failed to load status.',
    metricsKey: 'gitStatusFetch',
  });
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

      incrementDevPerformanceCounter('gitWatchEventsReceived');
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
