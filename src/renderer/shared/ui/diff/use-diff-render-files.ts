import { useEffect, useMemo, useRef, useState } from 'react';

import {
  createCommitContentPair,
  createComparisonContentPair,
  createWorkingTreeContentPair,
  projectDiffRows,
  type DiffContentPair,
  type DiffFile,
  type DiffRow,
} from '@/lib/diff';
import {
  highlightDiffFileContents,
  loadDiffFileContents,
  type DiffFileContents,
  type DiffFileTokens,
} from '@/renderer/shared/ui/diff/highlighter';
import { incrementDevPerformanceCounter } from '@/renderer/shared/lib/dev-performance';
import { getFromLruCache, setLruCacheValue } from '@/renderer/shared/lib/lru';

import type { AsyncState } from './diff-types';
import { getParsedDiffFiles } from './parsed-diff-files';

const SYNTAX_CACHE_LIMIT = 40;

type SyntaxCacheEntry = Promise<DiffFileTokens> | DiffFileTokens;
type ContentCacheEntry = Promise<DiffFileContents> | DiffFileContents;
type RowCacheEntry = DiffRow[];

export type DiffRenderContext =
  | { kind: 'working-tree'; repoPath: string }
  | { kind: 'commit'; repoPath: string; commitRevision: string; parentRevision: string | null }
  | { kind: 'comparison'; repoPath: string; oldRevision: string; newRevision: string };

export type DiffRenderFile = {
  path: string;
  status: DiffFile['status'];
  additions: number;
  deletions: number;
  diff: DiffFile;
  rows: DiffRow[];
  contentPair: DiffContentPair;
  contents: DiffFileContents | null;
  syntaxTokens: DiffFileTokens | null;
};

function areSyntaxTokenMapsEqual(
  left: Record<string, DiffFileTokens | null>,
  right: Record<string, DiffFileTokens | null>,
) {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  for (const [path, leftValue] of leftEntries) {
    if (!(path in right)) {
      return false;
    }

    if (right[path] !== leftValue) {
      return false;
    }
  }

  return true;
}

function areFileContentsMapsEqual(
  left: Record<string, DiffFileContents | null>,
  right: Record<string, DiffFileContents | null>,
) {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);

  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  for (const [path, leftValue] of leftEntries) {
    if (!(path in right)) {
      return false;
    }

    if (right[path] !== leftValue) {
      return false;
    }
  }

  return true;
}

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

function getContentCacheKey(pair: DiffContentPair) {
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

  return `${pair.displayPath}|${oldKey}|${newKey}`;
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function getRowCacheKey(file: DiffFile) {
  return `${file.displayPath}|${file.status}|${file.kind}|${hashString(file.rawText)}`;
}

export function useDiffRenderFiles({
  rawDiff,
  context,
  highlightPaths,
}: {
  rawDiff: AsyncState<string>;
  context: DiffRenderContext | null;
  highlightPaths?: readonly string[] | undefined;
}) {
  const [syntaxTokensByPath, setSyntaxTokensByPath] = useState<Record<string, DiffFileTokens | null>>({});
  const [contentsByPath, setContentsByPath] = useState<Record<string, DiffFileContents | null>>({});
  const syntaxCacheRef = useRef<Map<string, SyntaxCacheEntry>>(new Map());
  const contentCacheRef = useRef<Map<string, ContentCacheEntry>>(new Map());
  const rowCacheRef = useRef<Map<string, RowCacheEntry>>(new Map());
  const highlightPathsKey = highlightPaths === undefined
    ? null
    : highlightPaths
      .filter((path) => path.trim().length > 0)
      .join('\0');
  const highlightPathSet = useMemo(() => {
    if (highlightPathsKey === null) {
      return null;
    }

    if (highlightPathsKey.length === 0) {
      return new Set<string>();
    }

    return new Set(highlightPathsKey.split('\0'));
  }, [highlightPathsKey]);
  const parsedFiles = useMemo(
    () => (rawDiff.status === 'ready' && context !== null ? getParsedDiffFiles(rawDiff.data) : []),
    [context, rawDiff],
  );
  const visibleParsedFiles = useMemo(() => {
    if (highlightPathSet === null) {
      return parsedFiles;
    }

    if (highlightPathSet.size === 0) {
      return [] as DiffFile[];
    }

    return parsedFiles.filter((file) => highlightPathSet.has(file.displayPath));
  }, [highlightPathSet, parsedFiles]);

  const baseFiles = useMemo(() => {
    if (context === null || visibleParsedFiles.length === 0) {
      return [] as DiffRenderFile[];
    }

    incrementDevPerformanceCounter('diffRenderBuilds');

    return visibleParsedFiles.map((file) => {
      const rowCacheKey = getRowCacheKey(file);
      const cachedRows = getFromLruCache(rowCacheRef.current, rowCacheKey);
      const rows = cachedRows ?? projectDiffRows(file);

      if (cachedRows === undefined) {
        setLruCacheValue(rowCacheRef.current, rowCacheKey, rows, SYNTAX_CACHE_LIMIT);
      }

      const contentPair = createContentPair(context, file);

      return {
        path: file.displayPath,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        diff: file,
        rows,
        contentPair,
        contents: null,
        syntaxTokens: null,
      } satisfies DiffRenderFile;
    });
  }, [context, visibleParsedFiles]);

  useEffect(() => {
    if (rawDiff.status !== 'ready' || context === null || baseFiles.length === 0) {
      setSyntaxTokensByPath((current) =>
        Object.keys(current).length === 0 ? current : {}
      );
      setContentsByPath((current) =>
        Object.keys(current).length === 0 ? current : {}
      );
      return;
    }

    incrementDevPerformanceCounter('diffSyntaxEffectRuns');

    let cancelled = false;

    void Promise.all(
      baseFiles.map(async (file) => {
        if (file.diff.kind !== 'text' || file.diff.hunks.length === 0) {
          return [file.path, { syntaxTokens: null, contents: null }] as const;
        }

        if (highlightPathSet !== null && !highlightPathSet.has(file.path)) {
          return [file.path, { syntaxTokens: null, contents: null }] as const;
        }

        try {
          const contentCacheKey = getContentCacheKey(file.contentPair);
          const cachedContents = getFromLruCache(contentCacheRef.current, contentCacheKey);
          let contents: DiffFileContents;

          if (cachedContents instanceof Promise) {
            contents = await cachedContents;
          } else if (cachedContents) {
            contents = cachedContents;
          } else {
            const pendingContents = loadDiffFileContents(file.contentPair)
              .then((resolvedContents: DiffFileContents) => {
                setLruCacheValue(contentCacheRef.current, contentCacheKey, resolvedContents, SYNTAX_CACHE_LIMIT);
                return resolvedContents;
              })
              .catch((error: unknown) => {
                contentCacheRef.current.delete(contentCacheKey);
                throw error;
              });

            setLruCacheValue(contentCacheRef.current, contentCacheKey, pendingContents, SYNTAX_CACHE_LIMIT);
            contents = await pendingContents;
          }

          const cacheKey = getSyntaxCacheKey(file.diff, file.contentPair);
          const cached = getFromLruCache(syntaxCacheRef.current, cacheKey);

          if (cached instanceof Promise) {
            return [file.path, { syntaxTokens: await cached, contents }] as const;
          }

          if (cached) {
            return [file.path, { syntaxTokens: cached, contents }] as const;
          }

          const pending = highlightDiffFileContents(file.contentPair, file.diff, 2, contents)
            .then((tokens: DiffFileTokens) => {
              setLruCacheValue(syntaxCacheRef.current, cacheKey, tokens, SYNTAX_CACHE_LIMIT);
              return tokens;
            })
            .catch((error: unknown) => {
              syntaxCacheRef.current.delete(cacheKey);
              throw error;
            });

          setLruCacheValue(syntaxCacheRef.current, cacheKey, pending, SYNTAX_CACHE_LIMIT);

          return [file.path, { syntaxTokens: await pending, contents }] as const;
        } catch (error) {
          console.error(`Failed to load diff render assets for ${file.path}:`, error);
          return [file.path, { syntaxTokens: null, contents: null }] as const;
        }
      }),
    )
      .then((entries) => {
        if (cancelled) {
          return;
        }

        const nextSyntaxTokensByPath = Object.fromEntries(
          entries.map(([path, value]) => [path, value.syntaxTokens]),
        );
        const nextContentsByPath = Object.fromEntries(
          entries.map(([path, value]) => [path, value.contents]),
        );

        setSyntaxTokensByPath((current) =>
          areSyntaxTokenMapsEqual(current, nextSyntaxTokensByPath)
            ? current
            : nextSyntaxTokensByPath
        );
        setContentsByPath((current) =>
          areFileContentsMapsEqual(current, nextContentsByPath)
            ? current
            : nextContentsByPath
        );
      });

    return () => {
      cancelled = true;
    };
  }, [baseFiles, context, highlightPathSet, rawDiff.status]);

  return useMemo(
    () => baseFiles.map((file) => ({
      ...file,
      contents: contentsByPath[file.path] ?? null,
      syntaxTokens: syntaxTokensByPath[file.path] ?? null,
    })),
    [baseFiles, contentsByPath, syntaxTokensByPath],
  );
}
