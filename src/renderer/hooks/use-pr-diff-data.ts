import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PrDiffMetaResult } from '@/ipc/contracts';
import { parseDiffFiles, type DiffFile } from '@/renderer/lib/code-diff';

export type DiffSelection =
  | { type: 'commit'; index: number }
  | { type: 'all' };

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: string };

export function usePrDiffData({
  repoPath,
  prNumber,
  metaState,
}: {
  repoPath: string;
  prNumber: number;
  metaState: AsyncState<PrDiffMetaResult>;
}) {
  const [selection, setSelection] = useState<DiffSelection>({ type: 'commit', index: 0 });
  const [rawDiff, setRawDiff] = useState<AsyncState<string>>({ status: 'idle' });

  const diffCacheRef = useRef<Map<string, string>>(new Map());

  const snapshotKey = useMemo(() => {
    if (metaState.status !== 'ready') {
      return metaState.status;
    }

    if (metaState.data.status !== 'ready') {
      return `${metaState.data.status}:${metaState.data.reason}`;
    }

    return [
      metaState.data.baseBranch,
      metaState.data.headBranch,
      ...metaState.data.commits.map((commit) => commit.sha),
    ].join(':');
  }, [metaState]);

  useEffect(() => {
    diffCacheRef.current.clear();
    setSelection({ type: 'commit', index: 0 });
    setRawDiff({ status: 'idle' });
  }, [snapshotKey]);

  const cacheKey = useMemo(() => {
    if (metaState.status !== 'ready' || metaState.data.status !== 'ready') {
      return null;
    }

    if (selection.type === 'all') {
      return 'all';
    }

    const commit = metaState.data.commits[selection.index];
    return commit?.sha ?? null;
  }, [metaState, selection]);

  useEffect(() => {
    if (metaState.status !== 'ready' || metaState.data.status !== 'ready' || cacheKey === null) {
      return;
    }

    const cached = diffCacheRef.current.get(cacheKey);
    if (cached !== undefined) {
      setRawDiff({ status: 'ready', data: cached });
      return;
    }

    let cancelled = false;
    setRawDiff({ status: 'loading' });

    const fetchDiff =
      selection.type === 'all'
        ? window.electronAPI.getPrDiff(repoPath, prNumber)
        : window.electronAPI.getCommitDiff(repoPath, cacheKey);

    fetchDiff
      .then((data) => {
        if (cancelled) return;
        diffCacheRef.current.set(cacheKey, data);
        setRawDiff({ status: 'ready', data });
      })
      .catch((error) => {
        if (cancelled) return;
        setRawDiff({
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to load diff',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, metaState, prNumber, repoPath, selection.type]);

  const diffFiles = useMemo<DiffFile[]>(
    () => (rawDiff.status === 'ready' ? parseDiffFiles(rawDiff.data) : []),
    [rawDiff],
  );

  const handleSelectCommit = useCallback((index: number) => {
    setSelection({ type: 'commit', index });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelection({ type: 'all' });
  }, []);

  return {
    selection,
    rawDiff,
    diffFiles,
    handleSelectCommit,
    handleSelectAll,
  };
}
