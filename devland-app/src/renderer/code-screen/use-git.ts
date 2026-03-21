import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import type { GitBranch, GitStatus } from '@/ipc/contracts';
import { createCoalescedTaskRunner } from '@/renderer/shared/lib/coalesced-request';
import { incrementDevPerformanceCounter } from '@/renderer/shared/lib/dev-performance';
import { getFromLruCache, setLruCacheValue } from '@/renderer/shared/lib/lru';

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

type GitAsyncCacheValue<T> = {
  data: T;
  refreshVersion: number;
};

const GIT_ASYNC_CACHE_LIMIT = 12;

const createLoadingGitAsyncState = <T>(repoPath: string): ScopedAsyncState<T> => ({
  repoPath,
  status: 'loading',
  data: null,
  error: null,
  refreshVersion: 0,
});

export function getVisibleGitAsyncState<T>(
  repoPath: string,
  state: ScopedAsyncState<T>,
  cachedState?: GitAsyncCacheValue<T>,
): ScopedAsyncState<T> {
  if (state.repoPath === repoPath) {
    return state;
  }

  if (cachedState !== undefined) {
    return {
      repoPath,
      status: 'ready',
      data: cachedState.data,
      error: null,
      refreshVersion: cachedState.refreshVersion,
    };
  }

  return createLoadingGitAsyncState(repoPath);
}

const getCachedGitAsyncState = <T>(
  repoPath: string,
  cache: Map<string, GitAsyncCacheValue<T>>,
): ScopedAsyncState<T> => {
  const cachedState = getFromLruCache(cache, repoPath);

  if (cachedState === undefined) {
    return createLoadingGitAsyncState(repoPath);
  }

  return {
    repoPath,
    status: 'ready',
    data: cachedState.data,
    error: null,
    refreshVersion: cachedState.refreshVersion,
  };
};

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
  const cacheRef = useRef<Map<string, GitAsyncCacheValue<T>>>(new Map());
  const runner = useMemo(() => createCoalescedTaskRunner(), [repoPath]);

  const fetchValue = useCallback(async () => {
    return runner.run(async () => {
      const currentRepoPath = repoPath;
      const fetchId = ++fetchIdRef.current;
      const cachedState = getFromLruCache(cacheRef.current, currentRepoPath);
      incrementDevPerformanceCounter(`${metricsKey}Started`);

      setState(
        cachedState === undefined
          ? createLoadingGitAsyncState(currentRepoPath)
          : {
              repoPath: currentRepoPath,
              status: 'ready',
              data: cachedState.data,
              error: null,
              refreshVersion: cachedState.refreshVersion,
            },
      );

      try {
        const value = await load(repoPath);

        if (fetchIdRef.current !== fetchId) {
          return;
        }

        const nextCacheState = {
          data: value,
          refreshVersion: (cachedState?.refreshVersion ?? 0) + 1,
        };
        setLruCacheValue(
          cacheRef.current,
          currentRepoPath,
          nextCacheState,
          GIT_ASYNC_CACHE_LIMIT,
        );
        setState({
          repoPath: currentRepoPath,
          status: 'ready',
          data: value,
          error: null,
          refreshVersion: nextCacheState.refreshVersion,
        });
      } catch (error) {
        if (fetchIdRef.current !== fetchId) {
          return;
        }

        if (cachedState !== undefined) {
          setState({
            repoPath: currentRepoPath,
            status: 'ready',
            data: cachedState.data,
            error: null,
            refreshVersion: cachedState.refreshVersion,
          });
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
    setState(getCachedGitAsyncState(repoPath, cacheRef.current));
    void fetchValue();
  }, [fetchValue]);

  return {
    ...getVisibleGitAsyncState(
      repoPath,
      state,
      getFromLruCache(cacheRef.current, repoPath),
    ),
    refetch: fetchValue,
  };
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
