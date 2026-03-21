import { useCallback, useEffect, useRef, useState } from 'react';

import type { DevlandRepoContext } from '@devlandapp/sdk';

import { getProjectIssues } from '@/api/issues';
import {
  deleteCachedValue,
  getCachedValue,
  setCachedValue,
} from '@/lib/cache';
import {
  ProjectIssueFeedSchema,
  type ProjectIssueFeed,
} from '@/types/issues';

const ISSUES_CACHE_TTL_MS = 5 * 60_000;
const ISSUES_CACHE_VERSION = 'v1';

type ProjectIssuesState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: ProjectIssueFeed; error: null }
  | { status: 'error'; data: null; error: string };

export function useProjectIssues(repo: DevlandRepoContext) {
  const [state, setState] = useState<ProjectIssuesState>({
    status: 'loading',
    data: null,
    error: null,
  });
  const [isRefetching, setIsRefetching] = useState(false);
  const fetchIdRef = useRef(0);
  const cachedDataKeyRef = useRef<string | null>(null);
  const cachedDataRef = useRef<ProjectIssueFeed | null>(null);

  const loadFeed = useCallback((forceRefresh: boolean) => {
    const fetchId = ++fetchIdRef.current;
    const cacheKey = `${ISSUES_CACHE_VERSION}:${repo.owner}/${repo.name}`;

    void (async () => {
      let cachedData: ProjectIssueFeed | null = null;

      if (forceRefresh) {
        setIsRefetching(true);
      } else {
        setState({ status: 'loading', data: null, error: null });
      }

      if (!forceRefresh) {
        try {
          const cachedValue = await getCachedValue<unknown>(cacheKey);

          if (cachedValue !== null) {
            const parsedCache = ProjectIssueFeedSchema.safeParse(cachedValue);

            if (parsedCache.success) {
              cachedData = parsedCache.data;
            } else {
              await deleteCachedValue(cacheKey);
            }
          }
        } catch (error) {
          console.error('Could not read cached issues.', { repo, error });
        }

        if (fetchIdRef.current !== fetchId) return;

        if (cachedData !== null) {
          cachedDataKeyRef.current = cacheKey;
          cachedDataRef.current = cachedData;
          setState({ status: 'ready', data: cachedData, error: null });

          const isFresh =
            Date.now() - cachedData.fetchedAt <= ISSUES_CACHE_TTL_MS;

          if (isFresh) {
            setIsRefetching(false);
            return;
          }

          setIsRefetching(true);
        }
      }

      try {
        const freshData = await getProjectIssues(repo);

        if (fetchIdRef.current !== fetchId) return;

        cachedDataKeyRef.current = cacheKey;
        cachedDataRef.current = freshData;
        setState({ status: 'ready', data: freshData, error: null });

        try {
          await setCachedValue(cacheKey, freshData);
        } catch (error) {
          console.error('Could not persist cached issues.', { repo, error });
        }
      } catch (error: unknown) {
        if (fetchIdRef.current !== fetchId) return;

        const fallbackData = cachedData
          ?? (cachedDataKeyRef.current === cacheKey ? cachedDataRef.current : null);

        if (fallbackData !== null) {
          cachedDataKeyRef.current = cacheKey;
          cachedDataRef.current = fallbackData;
          setState({ status: 'ready', data: fallbackData, error: null });
          console.error('Could not refresh issues. Showing cached data.', {
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
              : 'Could not fetch project issues.',
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
