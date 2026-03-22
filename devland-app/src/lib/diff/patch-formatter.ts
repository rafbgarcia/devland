import { DiffSelection } from '@/lib/diff/selection';
import type { DiffFile, DiffHunk, DiffLine } from '@/lib/diff/types';

type PatchLineSet = {
  lines: string[];
  oldCount: number;
  newCount: number;
  hasSelectedChange: boolean;
  oldStartOffset: number;
  newStartOffset: number;
};

function formatHunkHeader(
  oldStartLine: number,
  oldLineCount: number,
  newStartLine: number,
  newLineCount: number,
  sectionHeading?: string | null,
) {
  const oldRange = oldLineCount === 1 ? `${oldStartLine}` : `${oldStartLine},${oldLineCount}`;
  const newRange = newLineCount === 1 ? `${newStartLine}` : `${newStartLine},${newLineCount}`;
  const heading = sectionHeading ? ` ${sectionHeading}` : '';

  return `@@ -${oldRange} +${newRange} @@${heading}`;
}

function formatFileHeaders(file: DiffFile) {
  const headerLines = [file.diffHeaderLine, ...file.metadataLines];

  return `${headerLines.join('\n')}\n`;
}

function pushContextLine(set: PatchLineSet, content: string, noTrailingNewline = false) {
  set.lines.push(` ${content}`);
  set.oldCount += 1;
  set.newCount += 1;

  if (noTrailingNewline) {
    set.lines.push('\\ No newline at end of file');
  }
}

function pushDeletedLine(set: PatchLineSet, content: string, noTrailingNewline: boolean) {
  set.lines.push(`-${content}`);
  set.oldCount += 1;
  set.hasSelectedChange = true;

  if (noTrailingNewline) {
    set.lines.push('\\ No newline at end of file');
  }
}

function pushAddedLine(set: PatchLineSet, content: string, noTrailingNewline: boolean) {
  set.lines.push(`+${content}`);
  set.newCount += 1;
  set.hasSelectedChange = true;

  if (noTrailingNewline) {
    set.lines.push('\\ No newline at end of file');
  }
}

function appendChangeGroup(
  selection: DiffSelection,
  set: PatchLineSet,
  lines: readonly DiffLine[],
) {
  const deletedLines = lines.filter((line) => line.kind === 'delete');
  const addedLines = lines.filter((line) => line.kind === 'add');
  const pairedLineCount = Math.min(deletedLines.length, addedLines.length);

  for (let index = 0; index < pairedLineCount; index += 1) {
    const deletedLine = deletedLines[index]!;
    const addedLine = addedLines[index]!;
    const deletedLineSelected = selection.isSelected(deletedLine.originalDiffLineNumber);
    const addedLineSelected = selection.isSelected(addedLine.originalDiffLineNumber);

    if (deletedLineSelected) {
      pushDeletedLine(set, deletedLine.content, deletedLine.noTrailingNewline);
    } else {
      pushContextLine(set, deletedLine.content, deletedLine.noTrailingNewline);
    }

    if (addedLineSelected) {
      pushAddedLine(set, addedLine.content, addedLine.noTrailingNewline);
    }
  }

  for (const deletedLine of deletedLines.slice(pairedLineCount)) {
    if (selection.isSelected(deletedLine.originalDiffLineNumber)) {
      pushDeletedLine(set, deletedLine.content, deletedLine.noTrailingNewline);
    } else {
      pushContextLine(set, deletedLine.content, deletedLine.noTrailingNewline);
    }
  }

  for (const addedLine of addedLines.slice(pairedLineCount)) {
    if (selection.isSelected(addedLine.originalDiffLineNumber)) {
      pushAddedLine(set, addedLine.content, addedLine.noTrailingNewline);
    }
  }
}

function formatHunkRows(
  hunk: DiffHunk,
  selection: DiffSelection,
) {
  const patch: PatchLineSet = {
    lines: [],
    oldCount: 0,
    newCount: 0,
    hasSelectedChange: false,
    oldStartOffset: 0,
    newStartOffset: 0,
  };
  let pendingChangeGroup: DiffLine[] = [];

  const flushPendingChangeGroup = () => {
    if (pendingChangeGroup.length === 0) {
      return;
    }

    appendChangeGroup(selection, patch, pendingChangeGroup);
    pendingChangeGroup = [];
  };

  for (const line of hunk.lines) {
    if (line.kind === 'context') {
      flushPendingChangeGroup();
      pushContextLine(patch, line.content, line.noTrailingNewline);
      continue;
    }

    pendingChangeGroup.push(line);
  }

  flushPendingChangeGroup();

  if (!patch.hasSelectedChange) {
    return null;
  }

  return [
    formatHunkHeader(
      hunk.header.oldStartLine + patch.oldStartOffset,
      patch.oldCount,
      hunk.header.newStartLine + patch.newStartOffset,
      patch.newCount,
      hunk.header.sectionHeading,
    ),
    ...patch.lines,
  ].join('\n');
}

export function formatPatchFromSelection(file: DiffFile, selection: DiffSelection) {
  const patchSections: string[] = [];
  for (const hunk of file.hunks) {
    const patchSection = formatHunkRows(hunk, selection);

    if (patchSection !== null) {
      patchSections.push(patchSection);
    }
  }

  if (patchSections.length === 0) {
    return null;
  }

  return `${formatFileHeaders(file)}${patchSections.join('\n')}\n`;
}
