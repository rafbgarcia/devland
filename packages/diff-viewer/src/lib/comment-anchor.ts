import type { DiffCommentAnchor, DiffCommentSide, DiffFile, DiffRow } from './types.js';

export function getCommentableLineNumber(
  row: DiffRow,
  side: DiffCommentSide,
): number | null {
  switch (row.kind) {
    case 'hunk':
      return null;
    case 'context':
      return side === 'old' ? row.beforeLineNumber : row.afterLineNumber;
    case 'deleted':
      return side === 'old' ? row.data.lineNumber : null;
    case 'added':
      return side === 'new' ? row.data.lineNumber : null;
    case 'modified':
      return side === 'old' ? row.before.lineNumber : row.after.lineNumber;
  }
}

function getRowContent(row: DiffRow, side: DiffCommentSide) {
  switch (row.kind) {
    case 'hunk':
      return null;
    case 'context':
      return row.content;
    case 'deleted':
      return side === 'old' ? row.data.content : null;
    case 'added':
      return side === 'new' ? row.data.content : null;
    case 'modified':
      return side === 'old' ? row.before.content : row.after.content;
  }
}

export function buildDiffCommentAnchor(
  file: DiffFile,
  rows: readonly DiffRow[],
  side: DiffCommentSide,
): DiffCommentAnchor | null {
  const lineNumbers = rows
    .map((row) => getCommentableLineNumber(row, side))
    .filter((lineNumber): lineNumber is number => lineNumber !== null);

  if (lineNumbers.length === 0) {
    return null;
  }

  const excerpt = rows
    .map((row) => getRowContent(row, side))
    .filter((content): content is string => content !== null);

  return {
    path: file.displayPath,
    oldPath: file.oldPath,
    newPath: file.newPath,
    side,
    line: lineNumbers[lineNumbers.length - 1]!,
    startLine: lineNumbers[0]!,
    endLine: lineNumbers[lineNumbers.length - 1]!,
    excerpt,
  };
}
