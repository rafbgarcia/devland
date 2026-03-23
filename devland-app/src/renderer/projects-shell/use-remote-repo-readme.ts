import { useEffect, useState } from 'react';

import type { RemoteRepoReadme } from '@/ipc/contracts';

type RemoteRepoReadmeState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: RemoteRepoReadme | null; error: null }
  | { status: 'error'; data: null; error: string };

const readmeCache = new Map<string, RemoteRepoReadme | null>();
const pendingReadmeLoads = new Map<string, Promise<RemoteRepoReadme | null>>();

const loadRemoteRepoReadme = async (slug: string): Promise<RemoteRepoReadme | null> => {
  const cachedReadme = readmeCache.get(slug);

  if (cachedReadme !== undefined) {
    return cachedReadme;
  }

  const pendingReadme = pendingReadmeLoads.get(slug);

  if (pendingReadme !== undefined) {
    return await pendingReadme;
  }

  const nextPromise = window.electronAPI.getRemoteRepoReadme(slug);
  pendingReadmeLoads.set(slug, nextPromise);

  try {
    const readme = await nextPromise;
    readmeCache.set(slug, readme);

    return readme;
  } finally {
    pendingReadmeLoads.delete(slug);
  }
};

export function useRemoteRepoReadme(slug: string) {
  const [state, setState] = useState<RemoteRepoReadmeState>(() => {
    const cachedReadme = readmeCache.get(slug);

    return cachedReadme !== undefined
      ? { status: 'ready', data: cachedReadme, error: null }
      : { status: 'loading', data: null, error: null };
  });

  useEffect(() => {
    const cachedReadme = readmeCache.get(slug);

    if (cachedReadme !== undefined) {
      setState({ status: 'ready', data: cachedReadme, error: null });
      return;
    }

    setState({ status: 'loading', data: null, error: null });
    let cancelled = false;

    void loadRemoteRepoReadme(slug)
      .then((readme) => {
        if (cancelled) {
          return;
        }

        setState({ status: 'ready', data: readme, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setState({
          status: 'error',
          data: null,
          error:
            error instanceof Error
              ? error.message
              : 'Could not load the repository README.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return state;
}
