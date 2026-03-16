import { useEffect, useMemo, useRef, useState } from 'react';

import {
  createCommitContentPair,
  createComparisonContentPair,
  createWorkingTreeContentPair,
  getDiffRowsRenderLineCount,
  parseUnifiedDiffDocument,
  projectDiffRows,
  type DiffContentPair,
  type DiffDisplayMode,
  type DiffFile,
  type DiffRow,
} from '@/lib/diff';
import { type AsyncState } from '@/renderer/hooks/use-pr-diff-data';
import {
  highlightDiffFileContents,
  type DiffFileTokens,
} from '@/renderer/lib/diff/highlighter';

export type DiffRenderContext =
  | { kind: 'working-tree'; repoPath: string }
  | { kind: 'commit'; repoPath: string; commitRevision: string; parentRevision: string | null }
  | { kind: 'comparison'; repoPath: string; oldRevision: string; newRevision: string };

export type DiffRenderFile = {
  path: string;
  status: DiffFile['status'];
  additions: number;
  deletions: number;
  renderLineCount: number;
  diff: DiffFile;
  rows: DiffRow[];
  contentPair: DiffContentPair;
  syntaxTokens: DiffFileTokens | null;
};

function createContentPair(context: DiffRenderContext, file: DiffFile): DiffContentPair {
  switch (context.kind) {
    case 'working-tree':
      return createWorkingTreeContentPair(context.repoPath, file);
    case 'commit':
      return createCommitContentPair(
        context.repoPath,
        context.commitRevision,
        context.parentRevision,
        file,
      );
    case 'comparison':
      return createComparisonContentPair(
        context.repoPath,
        context.oldRevision,
        context.newRevision,
        file,
      );
  }
}

function getSyntaxCacheKey(file: DiffFile, pair: DiffContentPair) {
  const oldKey =
    pair.oldSource.type === 'git'
      ? `git:${pair.oldSource.revision}:${pair.oldSource.path}`
      : pair.oldSource.type === 'working-tree'
      ? `working-tree:${pair.oldSource.path}`
      : 'none';
  const newKey =
    pair.newSource.type === 'git'
      ? `git:${pair.newSource.revision}:${pair.newSource.path}`
      : pair.newSource.type === 'working-tree'
      ? `working-tree:${pair.newSource.path}`
      : 'none';

  return `${file.displayPath}|${oldKey}|${newKey}|${file.rawText}`;
}

export function useDiffRenderFiles({
  rawDiff,
  context,
  displayMode,
  highlightPaths,
}: {
  rawDiff: AsyncState<string>;
  context: DiffRenderContext | null;
  displayMode: DiffDisplayMode;
  highlightPaths?: readonly string[] | undefined;
}) {
  const [syntaxTokensByPath, setSyntaxTokensByPath] = useState<Record<string, DiffFileTokens | null>>({});
  const syntaxCacheRef = useRef<Map<string, Promise<DiffFileTokens> | DiffFileTokens>>(new Map());
  const highlightPathSet = useMemo(
    () => highlightPaths === undefined ? null : new Set(highlightPaths),
    [highlightPaths],
  );

  const baseFiles = useMemo(() => {
    if (rawDiff.status !== 'ready' || context === null) {
      return [] as DiffRenderFile[];
    }

    return parseUnifiedDiffDocument(rawDiff.data).files.map((file) => {
      const rows = projectDiffRows(file);
      const contentPair = createContentPair(context, file);

      return {
        path: file.displayPath,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        renderLineCount: getDiffRowsRenderLineCount(rows, displayMode),
        diff: file,
        rows,
        contentPair,
        syntaxTokens: null,
      } satisfies DiffRenderFile;
    });
  }, [context, displayMode, rawDiff]);

  useEffect(() => {
    if (rawDiff.status !== 'ready' || context === null || baseFiles.length === 0) {
      setSyntaxTokensByPath({});
      return;
    }

    let cancelled = false;

    void Promise.all(
      baseFiles.map(async (file) => {
        if (file.diff.kind !== 'text' || file.diff.hunks.length === 0) {
          return [file.path, null] as const;
        }

        if (highlightPathSet !== null && !highlightPathSet.has(file.path)) {
          return [file.path, null] as const;
        }

        try {
          const cacheKey = getSyntaxCacheKey(file.diff, file.contentPair);
          const cached = syntaxCacheRef.current.get(cacheKey);

          if (cached instanceof Promise) {
            return [file.path, await cached] as const;
          }

          if (cached) {
            return [file.path, cached] as const;
          }

          const pending = highlightDiffFileContents(file.contentPair, file.diff)
            .then((tokens: DiffFileTokens) => {
              syntaxCacheRef.current.set(cacheKey, tokens);
              return tokens;
            })
            .catch((error: unknown) => {
              syntaxCacheRef.current.delete(cacheKey);
              throw error;
            });

          syntaxCacheRef.current.set(cacheKey, pending);

          return [file.path, await pending] as const;
        } catch (error) {
          console.error(`Failed to load syntax tokens for ${file.path}:`, error);
          return [file.path, null] as const;
        }
      }),
    )
      .then((entries) => {
        if (cancelled) {
          return;
        }

        setSyntaxTokensByPath(Object.fromEntries(entries));
      });

    return () => {
      cancelled = true;
    };
  }, [baseFiles, context, highlightPathSet, rawDiff.status]);

  return useMemo(
    () => baseFiles.map((file) => ({
      ...file,
      syntaxTokens: syntaxTokensByPath[file.path] ?? null,
    })),
    [baseFiles, syntaxTokensByPath],
  );
}
