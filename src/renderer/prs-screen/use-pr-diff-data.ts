import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PrDiffMetaResult } from '@/ipc/contracts';
import { parseDiffFiles, type DiffFile } from '@/renderer/shared/ui/diff/code-diff';
import type { AsyncState, DiffSelection } from '@/renderer/shared/ui/diff/diff-types';

export type PrDiffContext =
  | { kind: 'commit'; commitRevision: string; parentRevision: string | null }
  | { kind: 'comparison'; oldRevision: string; newRevision: string };

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
  const [commitParentRevision, setCommitParentRevision] = useState<string | null>(null);

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
    setCommitParentRevision(null);
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

  useEffect(() => {
    if (
      selection.type !== 'commit' ||
      metaState.status !== 'ready' ||
      metaState.data.status !== 'ready'
    ) {
      setCommitParentRevision(null);
      return;
    }

    const commit = metaState.data.commits[selection.index];

    if (!commit) {
      setCommitParentRevision(null);
      return;
    }

    let cancelled = false;

    window.electronAPI.getCommitParent(repoPath, commit.sha)
      .then((revision) => {
        if (!cancelled) {
          setCommitParentRevision(revision);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to load PR commit parent revision:', error);
          setCommitParentRevision(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [metaState, repoPath, selection]);

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

  const diffContext = useMemo<PrDiffContext | null>(() => {
    if (metaState.status !== 'ready' || metaState.data.status !== 'ready') {
      return null;
    }

    if (selection.type === 'all') {
      return {
        kind: 'comparison',
        oldRevision: metaState.data.baseRevision,
        newRevision: metaState.data.headRevision,
      };
    }

    const commit = metaState.data.commits[selection.index];

    if (!commit) {
      return null;
    }

    return {
      kind: 'commit',
      commitRevision: commit.sha,
      parentRevision: commitParentRevision,
    };
  }, [commitParentRevision, metaState, selection]);

  return {
    selection,
    rawDiff,
    diffFiles,
    diffContext,
    handleSelectCommit,
    handleSelectAll,
  };
}
