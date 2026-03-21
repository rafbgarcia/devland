import { useCallback, useEffect, useRef, useState } from 'react';

import type { DevlandRepoContext } from '@devlandapp/sdk';

import { getProjectPullRequests } from '@/api/pull-requests';
import {
  deleteCachedValue,
  getCachedValue,
  setCachedValue,
} from '@/lib/cache';
import {
  ProjectPullRequestFeedSchema,
  type ProjectPullRequestFeed,
} from '@/types/pull-requests';

const PULL_REQUESTS_CACHE_TTL_MS = 5 * 60_000;
const PULL_REQUESTS_CACHE_VERSION = 'v1';

type ProjectPullRequestsState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: ProjectPullRequestFeed; error: null }
  | { status: 'error'; data: null; error: string };

export function useProjectPullRequests(repo: DevlandRepoContext) {
  const [state, setState] = useState<ProjectPullRequestsState>({
    status: 'loading',
    data: null,
    error: null,
  });
  const [isRefetching, setIsRefetching] = useState(false);
  const fetchIdRef = useRef(0);
  const cachedDataKeyRef = useRef<string | null>(null);
  const cachedDataRef = useRef<ProjectPullRequestFeed | null>(null);

  const loadFeed = useCallback((forceRefresh: boolean) => {
    const fetchId = ++fetchIdRef.current;
    const cacheKey = `${PULL_REQUESTS_CACHE_VERSION}:${repo.owner}/${repo.name}`;

    void (async () => {
      let cachedData: ProjectPullRequestFeed | null = null;

      if (forceRefresh) {
        setIsRefetching(true);
      } else {
        setState({ status: 'loading', data: null, error: null });
      }

      if (!forceRefresh) {
        try {
          const cachedValue = await getCachedValue<unknown>(cacheKey);

          if (cachedValue !== null) {
            const parsedCache = ProjectPullRequestFeedSchema.safeParse(cachedValue);

            if (parsedCache.success) {
              cachedData = parsedCache.data;
            } else {
              await deleteCachedValue(cacheKey);
            }
          }
        } catch (error) {
          console.error('Could not read cached pull requests.', { repo, error });
        }

        if (fetchIdRef.current !== fetchId) return;

        if (cachedData !== null) {
          cachedDataKeyRef.current = cacheKey;
          cachedDataRef.current = cachedData;
          setState({ status: 'ready', data: cachedData, error: null });

          const isFresh =
            Date.now() - cachedData.fetchedAt <= PULL_REQUESTS_CACHE_TTL_MS;

          if (isFresh) {
            setIsRefetching(false);
            return;
          }

          setIsRefetching(true);
        }
      }

      try {
        const freshData = await getProjectPullRequests(repo);

        if (fetchIdRef.current !== fetchId) return;

        cachedDataKeyRef.current = cacheKey;
        cachedDataRef.current = freshData;
        setState({ status: 'ready', data: freshData, error: null });

        try {
          await setCachedValue(cacheKey, freshData);
        } catch (error) {
          console.error('Could not persist cached pull requests.', { repo, error });
        }
      } catch (error: unknown) {
        if (fetchIdRef.current !== fetchId) return;

        const fallbackData = cachedData
          ?? (cachedDataKeyRef.current === cacheKey ? cachedDataRef.current : null);

        if (fallbackData !== null) {
          cachedDataRef.current = fallbackData;
          setState({ status: 'ready', data: fallbackData, error: null });
          console.error('Could not refresh pull requests. Showing cached data.', {
            repo,
            error,
          });
          return;
        }

        cachedDataKeyRef.current = null;
        cachedDataRef.current = null;
        setState({
          status: 'error',
          data: null,
          error:
            error instanceof Error
              ? error.message
              : 'Could not fetch project pull requests.',
        });
      } finally {
        if (fetchIdRef.current !== fetchId) return;
        setIsRefetching(false);
      }
    })();
  }, [repo.name, repo.owner]);

  const refetch = useCallback(() => {
    loadFeed(true);
  }, [loadFeed]);

  useEffect(() => {
    loadFeed(false);
  }, [loadFeed]);

  return {
    ...state,
    isRefetching,
    refetch,
  };
}
