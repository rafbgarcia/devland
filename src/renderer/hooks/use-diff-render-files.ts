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

const SYNTAX_CACHE_LIMIT = 40;
const PARSED_DIFF_CACHE_LIMIT = 12;

type SyntaxCacheEntry = Promise<DiffFileTokens> | DiffFileTokens;
type ParsedDiffEntry = Array<{
  path: string;
  status: DiffFile['status'];
  additions: number;
  deletions: number;
  diff: DiffFile;
  rows: DiffRow[];
}>;

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
  const diffHash = hashString(file.rawText);

  return `${file.displayPath}|${file.status}|${file.additions}|${file.deletions}|${oldKey}|${newKey}|${diffHash}`;
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function getFromLruCache<T>(cache: Map<string, T>, key: string) {
  const cached = cache.get(key);

  if (cached === undefined) {
    return undefined;
  }

  cache.delete(key);
  cache.set(key, cached);

  return cached;
}

function setLruCacheValue<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit: number,
) {
  if (cache.has(key)) {
    cache.delete(key);
  }

  cache.set(key, value);

  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;

    if (oldestKey === undefined) {
      break;
    }

    cache.delete(oldestKey);
  }
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
  const syntaxCacheRef = useRef<Map<string, SyntaxCacheEntry>>(new Map());
  const parsedDiffCacheRef = useRef<Map<string, ParsedDiffEntry>>(new Map());
  const highlightPathSet = useMemo(
    () => highlightPaths === undefined ? null : new Set(highlightPaths),
    [highlightPaths],
  );
  const rawDiffCacheKey = useMemo(() => {
    if (rawDiff.status !== 'ready') {
      return null;
    }

    return `${rawDiff.data.length}:${hashString(rawDiff.data)}`;
  }, [rawDiff]);

  const baseFiles = useMemo(() => {
    if (rawDiff.status !== 'ready' || context === null) {
      return [] as DiffRenderFile[];
    }

    let parsedDiff = rawDiffCacheKey === null
      ? undefined
      : getFromLruCache(parsedDiffCacheRef.current, rawDiffCacheKey);

    if (parsedDiff === undefined) {
      parsedDiff = parseUnifiedDiffDocument(rawDiff.data).files.map((file) => ({
        path: file.displayPath,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        diff: file,
        rows: projectDiffRows(file),
      }));

      if (rawDiffCacheKey !== null) {
        setLruCacheValue(parsedDiffCacheRef.current, rawDiffCacheKey, parsedDiff, PARSED_DIFF_CACHE_LIMIT);
      }
    }

    return parsedDiff.map((file) => {
      const contentPair = createContentPair(context, file.diff);

      return {
        path: file.path,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        renderLineCount: getDiffRowsRenderLineCount(file.rows, displayMode),
        diff: file.diff,
        rows: file.rows,
        contentPair,
        syntaxTokens: null,
      } satisfies DiffRenderFile;
    });
  }, [context, displayMode, rawDiff, rawDiffCacheKey]);

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
          const cached = getFromLruCache(syntaxCacheRef.current, cacheKey);

          if (cached instanceof Promise) {
            return [file.path, await cached] as const;
          }

          if (cached) {
            return [file.path, cached] as const;
          }

          const pending = highlightDiffFileContents(file.contentPair, file.diff)
            .then((tokens: DiffFileTokens) => {
              setLruCacheValue(syntaxCacheRef.current, cacheKey, tokens, SYNTAX_CACHE_LIMIT);
              return tokens;
            })
            .catch((error: unknown) => {
              syntaxCacheRef.current.delete(cacheKey);
              throw error;
            });

          setLruCacheValue(syntaxCacheRef.current, cacheKey, pending, SYNTAX_CACHE_LIMIT);

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
