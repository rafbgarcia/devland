import { useEffect, useMemo, useState } from 'react';

import type { ProjectExtension } from '@/extensions/contracts';

type ProjectExtensionsState =
  | { status: 'loading'; data: ProjectExtension[]; error: null }
  | { status: 'ready'; data: ProjectExtension[]; error: null }
  | { status: 'error'; data: ProjectExtension[]; error: string };

const extensionsCache = new Map<string, ProjectExtension[]>();
const pendingExtensionLoads = new Map<string, Promise<ProjectExtension[]>>();

const clearProjectExtensionsCache = (repoPath: string) => {
  extensionsCache.delete(repoPath);
  pendingExtensionLoads.delete(repoPath);
};

const loadProjectExtensions = async (repoPath: string): Promise<ProjectExtension[]> => {
  const cachedExtensions = extensionsCache.get(repoPath);

  if (cachedExtensions !== undefined) {
    return cachedExtensions;
  }

  const pendingExtensionsPromise = pendingExtensionLoads.get(repoPath);

  if (pendingExtensionsPromise !== undefined) {
    return await pendingExtensionsPromise;
  }

  const nextPromise = window.electronAPI.getRepoExtensions(repoPath);
  pendingExtensionLoads.set(repoPath, nextPromise);

  try {
    const extensions = await nextPromise;
    extensionsCache.set(repoPath, extensions);

    return extensions;
  } finally {
    pendingExtensionLoads.delete(repoPath);
  }
};

export function useProjectExtensions(repoPath: string | null) {
  const [state, setState] = useState<ProjectExtensionsState>(() =>
    repoPath === null
      ? { status: 'ready', data: [], error: null }
      : {
          status: 'ready',
          data: extensionsCache.get(repoPath) ?? [],
          error: null,
        },
  );

  useEffect(() => {
    if (repoPath === null) {
      setState({ status: 'ready', data: [], error: null });

      return;
    }

    const cachedExtensions = extensionsCache.get(repoPath);

    if (cachedExtensions !== undefined) {
      setState({ status: 'ready', data: cachedExtensions, error: null });

      return;
    }

    setState({ status: 'loading', data: [], error: null });
    let cancelled = false;

    void loadProjectExtensions(repoPath)
      .then((extensions) => {
        if (cancelled) {
          return;
        }

        setState({
          status: 'ready',
          data: extensions,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setState({
          status: 'error',
          data: [],
          error:
            error instanceof Error
              ? error.message
              : 'Could not load project extensions.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  const byId = useMemo(
    () => new Map(state.data.map((extension) => [extension.id, extension])),
    [state.data],
  );

  const refresh = async (): Promise<void> => {
    if (repoPath === null) {
      setState({ status: 'ready', data: [], error: null });
      return;
    }

    clearProjectExtensionsCache(repoPath);
    setState((current) => ({
      status: 'loading',
      data: current.data,
      error: null,
    }));

    try {
      const extensions = await loadProjectExtensions(repoPath);

      setState({
        status: 'ready',
        data: extensions,
        error: null,
      });
    } catch (error) {
      setState({
        status: 'error',
        data: [],
        error:
          error instanceof Error
            ? error.message
            : 'Could not load project extensions.',
      });
    }
  };

  return {
    ...state,
    byId,
    refresh,
  };
}
