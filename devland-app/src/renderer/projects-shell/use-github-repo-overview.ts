import { useEffect, useState } from 'react';

import type { GithubRepoOverview } from '@/ipc/contracts';

type GithubRepoOverviewState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: GithubRepoOverview | null }
  | { status: 'error'; data: null };

const overviewCache = new Map<string, GithubRepoOverview | null>();
const pendingLoads = new Map<string, Promise<GithubRepoOverview | null>>();

const loadOverview = async (slug: string): Promise<GithubRepoOverview | null> => {
  const cached = overviewCache.get(slug);

  if (cached !== undefined) {
    return cached;
  }

  const pending = pendingLoads.get(slug);

  if (pending !== undefined) {
    return await pending;
  }

  const promise = window.electronAPI.getGithubRepoOverview(slug);
  pendingLoads.set(slug, promise);

  try {
    const overview = await promise;
    overviewCache.set(slug, overview);

    return overview;
  } finally {
    pendingLoads.delete(slug);
  }
};

export function useGithubRepoOverview(slug: string) {
  const [state, setState] = useState<GithubRepoOverviewState>(() => {
    const cached = overviewCache.get(slug);

    return cached !== undefined
      ? { status: 'ready', data: cached }
      : { status: 'loading', data: null };
  });

  useEffect(() => {
    const cached = overviewCache.get(slug);

    if (cached !== undefined) {
      setState({ status: 'ready', data: cached });
      return;
    }

    setState({ status: 'loading', data: null });
    let cancelled = false;

    void loadOverview(slug)
      .then((overview) => {
        if (!cancelled) {
          setState({ status: 'ready', data: overview });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'error', data: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return state;
}
