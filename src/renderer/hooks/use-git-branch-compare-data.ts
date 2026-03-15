import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CodeChangesMeta } from '@/ipc/contracts';
import { parseDiffFiles, type DiffFile } from '@/renderer/lib/code-diff';
import { type AsyncState, type DiffSelection } from '@/renderer/hooks/use-pr-diff-data';

export function useGitBranchCompareData({
  repoPath,
  baseBranch,
  headBranch,
}: {
  repoPath: string;
  baseBranch: string;
  headBranch: string;
}) {
  const [metaState, setMetaState] = useState<AsyncState<CodeChangesMeta>>({ status: 'loading' });
  const [selection, setSelection] = useState<DiffSelection>({ type: 'all' });
  const [rawDiff, setRawDiff] = useState<AsyncState<string>>({ status: 'idle' });
  const diffCacheRef = useRef<Map<string, string>>(new Map());
  const metaFetchIdRef = useRef(0);

  useEffect(() => {
    const fetchId = ++metaFetchIdRef.current;

    diffCacheRef.current.clear();
    setSelection({ type: 'all' });
    setRawDiff({ status: 'idle' });
    setMetaState({ status: 'loading' });

    window.electronAPI.getGitBranchCompareMeta(repoPath, baseBranch, headBranch)
      .then((meta) => {
        if (metaFetchIdRef.current !== fetchId) {
          return;
        }

        setMetaState({ status: 'ready', data: meta });
      })
      .catch((error) => {
        if (metaFetchIdRef.current !== fetchId) {
          return;
        }

        setMetaState({
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to load branch comparison.',
        });
      });
  }, [baseBranch, headBranch, repoPath]);

  const snapshotKey = useMemo(() => {
    if (metaState.status !== 'ready') {
      return metaState.status;
    }

    return [
      metaState.data.baseBranch,
      metaState.data.headBranch,
      ...metaState.data.commits.map((commit) => commit.sha),
    ].join(':');
  }, [metaState]);

  useEffect(() => {
    diffCacheRef.current.clear();
    setSelection({ type: 'all' });
    setRawDiff({ status: 'idle' });
  }, [snapshotKey]);

  const cacheKey = useMemo(() => {
    if (metaState.status !== 'ready') {
      return null;
    }

    if (selection.type === 'all') {
      return 'all';
    }

    const commit = metaState.data.commits[selection.index];
    return commit?.sha ?? null;
  }, [metaState, selection]);

  useEffect(() => {
    if (metaState.status !== 'ready' || cacheKey === null) {
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
        ? window.electronAPI.getGitBranchCompareDiff(repoPath, baseBranch, headBranch)
        : window.electronAPI.getCommitDiff(repoPath, cacheKey);

    fetchDiff
      .then((data) => {
        if (cancelled) {
          return;
        }

        diffCacheRef.current.set(cacheKey, data);
        setRawDiff({ status: 'ready', data });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setRawDiff({
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to load diff',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [baseBranch, cacheKey, headBranch, metaState, repoPath, selection.type]);

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
    metaState,
    selection,
    rawDiff,
    diffFiles,
    handleSelectCommit,
    handleSelectAll,
  };
}
