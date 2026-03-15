import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { GitBranchHistory, GitStatusFile } from '@/ipc/contracts';
import { parseDiffFiles, type DiffFile } from '@/renderer/lib/code-diff';
import { type AsyncState } from '@/renderer/hooks/use-pr-diff-data';

export function useGitBranchHistory({
  repoPath,
  branchName,
}: {
  repoPath: string;
  branchName: string;
}) {
  const [historyState, setHistoryState] = useState<AsyncState<GitBranchHistory>>({ status: 'loading' });
  const fetchIdRef = useRef(0);
  const fetchMeta = useCallback(() => {
      const fetchId = ++fetchIdRef.current;
      setHistoryState({ status: 'loading' });

      window.electronAPI.getGitBranchHistory(repoPath, branchName)
        .then((history) => {
          if (fetchIdRef.current !== fetchId) {
            return;
          }

          setHistoryState({ status: 'ready', data: history });
        })
        .catch((error) => {
          if (fetchIdRef.current !== fetchId) {
            return;
          }

          setHistoryState({
            status: 'error',
            error: error instanceof Error ? error.message : 'Failed to load branch history.',
          });
        });
    },
    [branchName, repoPath],
  );

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  return { historyState, refetch: fetchMeta };
}

export function useGitWorkingTreeDiff({
  repoPath,
  files,
}: {
  repoPath: string;
  files: GitStatusFile[];
}) {
  const [rawDiff, setRawDiff] = useState<AsyncState<string>>({ status: 'loading' });
  const fetchIdRef = useRef(0);

  const snapshotKey = useMemo(
    () => files.map((file) => `${file.status}:${file.path}`).join('|'),
    [files],
  );

  useEffect(() => {
    const fetchId = ++fetchIdRef.current;

    if (files.length === 0) {
      setRawDiff({ status: 'ready', data: '' });
      return;
    }

    setRawDiff({ status: 'loading' });

    window.electronAPI.getGitWorkingTreeDiff(repoPath)
      .then((diff) => {
        if (fetchIdRef.current !== fetchId) {
          return;
        }

        setRawDiff({ status: 'ready', data: diff });
      })
      .catch((error) => {
        if (fetchIdRef.current !== fetchId) {
          return;
        }

        setRawDiff({
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to load working tree diff.',
        });
      });
  }, [files.length, repoPath, snapshotKey]);

  const diffFiles = useMemo<DiffFile[]>(
    () => (rawDiff.status === 'ready' ? parseDiffFiles(rawDiff.data) : []),
    [rawDiff],
  );

  return {
    rawDiff,
    diffFiles,
  };
}

export function useGitCommitDiff({
  repoPath,
  commitSha,
}: {
  repoPath: string;
  commitSha: string | null;
}) {
  const [rawDiff, setRawDiff] = useState<AsyncState<string>>({ status: 'idle' });
  const [parentRevision, setParentRevision] = useState<string | null>(null);
  const diffCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (commitSha === null) {
      setRawDiff({ status: 'idle' });
      setParentRevision(null);
      return undefined;
    }

    const cached = diffCacheRef.current.get(commitSha);
    if (cached !== undefined) {
      setRawDiff({ status: 'ready', data: cached });
    } else {
      let cancelled = false;
      setRawDiff({ status: 'loading' });

      window.electronAPI.getCommitDiff(repoPath, commitSha)
        .then((diff) => {
          if (cancelled) {
            return;
          }

          diffCacheRef.current.set(commitSha, diff);
          setRawDiff({ status: 'ready', data: diff });
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }

          setRawDiff({
            status: 'error',
            error: error instanceof Error ? error.message : 'Failed to load commit diff.',
          });
        });

      return () => {
        cancelled = true;
      };
    }

  }, [commitSha, repoPath]);

  useEffect(() => {
    if (commitSha === null) {
      setParentRevision(null);
      return;
    }

    let cancelled = false;

    window.electronAPI.getCommitParent(repoPath, commitSha)
      .then((revision) => {
        if (!cancelled) {
          setParentRevision(revision);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to load commit parent revision:', error);
          setParentRevision(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [commitSha, repoPath]);

  const diffFiles = useMemo<DiffFile[]>(
    () => (rawDiff.status === 'ready' ? parseDiffFiles(rawDiff.data) : []),
    [rawDiff],
  );

  return {
    rawDiff,
    diffFiles,
    parentRevision,
  };
}
