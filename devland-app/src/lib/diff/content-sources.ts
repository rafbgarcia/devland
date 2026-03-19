import type { DiffFile, DiffHunk } from '@/lib/diff/types';

export const MAX_HIGHLIGHT_CONTENT_BYTES = 256 * 1024;

export type DiffContentSource =
  | { type: 'git'; repoPath: string; revision: string; path: string }
  | { type: 'working-tree'; repoPath: string; path: string }
  | { type: 'none' };

export type DiffContentPair = {
  displayPath: string;
  oldSource: DiffContentSource;
  newSource: DiffContentSource;
};

export type DiffLineFilters = {
  oldLineFilter: number[];
  newLineFilter: number[];
};

export type DiffHighlightToken = {
  length: number;
  token?: string;
  htmlStyle?: Record<string, string>;
};

export type DiffHighlightLineTokens = Record<number, DiffHighlightToken>;
export type DiffHighlightTokens = Record<number, DiffHighlightLineTokens>;

export function getDiffLineFilters(hunks: ReadonlyArray<DiffHunk>): DiffLineFilters {
  const oldLineFilter: number[] = [];
  const newLineFilter: number[] = [];

  let anyAdded = false;
  let anyDeleted = false;

  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      anyAdded = anyAdded || line.kind === 'add';
      anyDeleted = anyDeleted || line.kind === 'delete';
    }
  }

  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.oldLineNumber !== null && line.newLineNumber !== null) {
        if (anyAdded && !anyDeleted) {
          newLineFilter.push(line.newLineNumber - 1);
        } else {
          oldLineFilter.push(line.oldLineNumber - 1);
        }
        continue;
      }

      if (line.oldLineNumber !== null) {
        oldLineFilter.push(line.oldLineNumber - 1);
      } else if (line.newLineNumber !== null) {
        newLineFilter.push(line.newLineNumber - 1);
      }
    }
  }

  return { oldLineFilter, newLineFilter };
}

export function createWorkingTreeContentPair(
  repoPath: string,
  file: DiffFile,
): DiffContentPair {
  return {
    displayPath: file.displayPath,
    oldSource:
      file.status === 'added' || file.status === 'untracked'
        ? { type: 'none' }
        : {
            type: 'git',
            repoPath,
            revision: 'HEAD',
            path: file.oldPath ?? file.displayPath,
          },
    newSource:
      file.status === 'deleted'
        ? { type: 'none' }
        : {
            type: 'working-tree',
            repoPath,
            path: file.newPath ?? file.displayPath,
          },
  };
}

export function createCommitContentPair(
  repoPath: string,
  commitRevision: string,
  parentRevision: string | null,
  file: DiffFile,
): DiffContentPair {
  return {
    displayPath: file.displayPath,
    oldSource:
      file.status === 'added' || parentRevision === null
        ? { type: 'none' }
        : {
            type: 'git',
            repoPath,
            revision: parentRevision,
            path: file.oldPath ?? file.displayPath,
          },
    newSource:
      file.status === 'deleted'
        ? { type: 'none' }
        : {
            type: 'git',
            repoPath,
            revision: commitRevision,
            path: file.newPath ?? file.displayPath,
          },
  };
}

export function createComparisonContentPair(
  repoPath: string,
  oldRevision: string,
  newRevision: string,
  file: DiffFile,
): DiffContentPair {
  return {
    displayPath: file.displayPath,
    oldSource:
      file.status === 'added'
        ? { type: 'none' }
        : {
            type: 'git',
            repoPath,
            revision: oldRevision,
            path: file.oldPath ?? file.displayPath,
          },
    newSource:
      file.status === 'deleted'
        ? { type: 'none' }
        : {
            type: 'git',
            repoPath,
            revision: newRevision,
            path: file.newPath ?? file.displayPath,
          },
  };
}
