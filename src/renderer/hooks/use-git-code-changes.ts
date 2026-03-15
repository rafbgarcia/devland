import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CodeChangesMeta, GitStatusFile } from '@/ipc/contracts';
import { parseDiffFiles, type DiffFile } from '@/renderer/lib/code-diff';
import { type AsyncState } from '@/renderer/hooks/use-pr-diff-data';

export function useGitHistoryMeta({
  repoPath,
  baseBranch,
  headBranch,
}: {
  repoPath: string;
  baseBranch: string;
  headBranch: string;
}) {
  const [metaState, setMetaState] = useState<AsyncState<CodeChangesMeta>>({ status: 'loading' });
  const fetchIdRef = useRef(0);
  const fetchMeta = useCallback(() => {
      const fetchId = ++fetchIdRef.current;
      setMetaState({ status: 'loading' });

      window.electronAPI.getGitBranchCompareMeta(repoPath, baseBranch, headBranch)
        .then((meta) => {
          if (fetchIdRef.current !== fetchId) {
            return;
          }

          setMetaState({ status: 'ready', data: meta });
        })
        .catch((error) => {
          if (fetchIdRef.current !== fetchId) {
            return;
          }

          setMetaState({
            status: 'error',
            error: error instanceof Error ? error.message : 'Failed to load branch history.',
          });
        });
    },
    [baseBranch, headBranch, repoPath],
  );

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

  return { metaState, refetch: fetchMeta };
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
  const diffCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (commitSha === null) {
      setRawDiff({ status: 'idle' });
      return;
    }

    const cached = diffCacheRef.current.get(commitSha);
    if (cached !== undefined) {
      setRawDiff({ status: 'ready', data: cached });
      return;
    }

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
  }, [commitSha, repoPath]);

  const diffFiles = useMemo<DiffFile[]>(
    () => (rawDiff.status === 'ready' ? parseDiffFiles(rawDiff.data) : []),
    [rawDiff],
  );

  return {
    rawDiff,
    diffFiles,
  };
}
