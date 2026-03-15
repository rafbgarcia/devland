import type {
  DiffChangedLine,
  DiffDisplayMode,
  DiffFile,
  DiffLine,
  DiffRow,
} from '@/lib/diff/types';

type ModifiedLineCandidate = {
  line: DiffLine;
};

const MAX_INTRA_LINE_DIFF_LENGTH = 1024;

function toChangedLine(
  line: DiffLine,
  lineNumberField: 'oldLineNumber' | 'newLineNumber',
): DiffChangedLine {
  const lineNumber = line[lineNumberField];

  if (lineNumber === null) {
    throw new Error(`Expected ${lineNumberField} on diff line ${line.originalDiffLineNumber}`);
  }

  return {
    content: line.content,
    lineNumber,
    originalDiffLineNumber: line.originalDiffLineNumber,
    noTrailingNewline: line.noTrailingNewline,
    isSelectable: line.isSelectable,
  };
}

function flushModifiedCandidates(
  rows: DiffRow[],
  modifiedCandidates: ModifiedLineCandidate[],
  changeGroupStartLineNumber: number | null,
) {
  if (modifiedCandidates.length === 0 || changeGroupStartLineNumber === null) {
    return;
  }

  const addedLines = modifiedCandidates
    .filter((candidate) => candidate.line.kind === 'add')
    .map((candidate) => candidate.line);
  const deletedLines = modifiedCandidates
    .filter((candidate) => candidate.line.kind === 'delete')
    .map((candidate) => candidate.line);
  const pairedLineCount = Math.min(addedLines.length, deletedLines.length);
  const canIntraLineDiff = addedLines.length === deletedLines.length;

  for (let index = 0; index < pairedLineCount; index += 1) {
    rows.push({
      kind: 'modified',
      changeGroupStartLineNumber,
      canIntraLineDiff,
      before: toChangedLine(deletedLines[index]!, 'oldLineNumber'),
      after: toChangedLine(addedLines[index]!, 'newLineNumber'),
    });
  }

  for (let index = pairedLineCount; index < deletedLines.length; index += 1) {
    rows.push({
      kind: 'deleted',
      changeGroupStartLineNumber,
      data: toChangedLine(deletedLines[index]!, 'oldLineNumber'),
    });
  }

  for (let index = pairedLineCount; index < addedLines.length; index += 1) {
    rows.push({
      kind: 'added',
      changeGroupStartLineNumber,
      data: toChangedLine(addedLines[index]!, 'newLineNumber'),
    });
  }
}

export function projectDiffRows(file: DiffFile): DiffRow[] {
  const rows: DiffRow[] = [];

  for (const hunk of file.hunks) {
    rows.push({
      kind: 'hunk',
      content: hunk.header.text,
      originalStartLineNumber: hunk.originalStartLineNumber,
      header: hunk.header,
    });

    let modifiedCandidates: ModifiedLineCandidate[] = [];
    let changeGroupStartLineNumber: number | null = null;

    for (const line of hunk.lines) {
      if (line.kind === 'context') {
        flushModifiedCandidates(rows, modifiedCandidates, changeGroupStartLineNumber);
        modifiedCandidates = [];
        changeGroupStartLineNumber = null;

        if (line.oldLineNumber === null || line.newLineNumber === null) {
          throw new Error(`Expected context line numbers on ${line.originalDiffLineNumber}`);
        }

        rows.push({
          kind: 'context',
          content: line.content,
          beforeLineNumber: line.oldLineNumber,
          afterLineNumber: line.newLineNumber,
          originalDiffLineNumber: line.originalDiffLineNumber,
        });
        continue;
      }

      if (changeGroupStartLineNumber === null) {
        changeGroupStartLineNumber = line.originalDiffLineNumber;
      }

      modifiedCandidates.push({ line });
    }

    flushModifiedCandidates(rows, modifiedCandidates, changeGroupStartLineNumber);
  }

  return rows;
}

export function shouldComputeIntraLineDiff(before: string, after: string) {
  return before.length < MAX_INTRA_LINE_DIFF_LENGTH && after.length < MAX_INTRA_LINE_DIFF_LENGTH;
}

export function getDiffRowsRenderLineCount(rows: readonly DiffRow[], displayMode: DiffDisplayMode) {
  return rows.reduce((count, row) => {
    if (displayMode === 'unified' && row.kind === 'modified') {
      return count + 2;
    }

    return count + 1;
  }, 0);
}

export { MAX_INTRA_LINE_DIFF_LENGTH };
