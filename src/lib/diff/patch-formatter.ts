import { projectDiffRows } from '@/lib/diff/project-rows';
import { DiffSelection } from '@/lib/diff/selection';
import type { DiffFile, DiffHunkHeader, DiffRow } from '@/lib/diff/types';

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

function pushContextLine(set: PatchLineSet, content: string) {
  set.lines.push(` ${content}`);
  set.oldCount += 1;
  set.newCount += 1;
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

function skipLeadingUnchangedRow(set: PatchLineSet, row: Exclude<DiffRow, { kind: 'hunk' }>) {
  switch (row.kind) {
    case 'context':
      set.oldStartOffset += 1;
      set.newStartOffset += 1;
      break;
    case 'deleted':
      set.oldStartOffset += 1;
      set.newStartOffset += 1;
      break;
    case 'added':
      break;
    case 'modified':
      set.oldStartOffset += 1;
      set.newStartOffset += 1;
      break;
  }
}

function appendRow(
  file: DiffFile,
  selection: DiffSelection,
  set: PatchLineSet,
  row: Exclude<DiffRow, { kind: 'hunk' }>,
) {
  switch (row.kind) {
    case 'context':
      pushContextLine(set, row.content);
      break;
    case 'deleted': {
      const isSelected = selection.isSelected(row.data.originalDiffLineNumber);

      if (isSelected) {
        pushDeletedLine(set, row.data.content, row.data.noTrailingNewline);
      } else {
        pushContextLine(set, row.data.content);
      }
      break;
    }
    case 'added': {
      const isSelected = selection.isSelected(row.data.originalDiffLineNumber);

      if (isSelected) {
        pushAddedLine(set, row.data.content, row.data.noTrailingNewline);
      } else if (file.status !== 'added' && file.status !== 'untracked') {
        // Unselected additions disappear from the patch.
      }
      break;
    }
    case 'modified': {
      const beforeSelected = selection.isSelected(row.before.originalDiffLineNumber);
      const afterSelected = selection.isSelected(row.after.originalDiffLineNumber);

      if (beforeSelected && afterSelected) {
        pushDeletedLine(set, row.before.content, row.before.noTrailingNewline);
        pushAddedLine(set, row.after.content, row.after.noTrailingNewline);
      } else if (!beforeSelected && !afterSelected) {
        pushContextLine(set, row.before.content);
      } else if (beforeSelected) {
        pushDeletedLine(set, row.before.content, row.before.noTrailingNewline);
      } else {
        pushAddedLine(set, row.after.content, row.after.noTrailingNewline);
      }
      break;
    }
  }
}

function formatHunkRows(
  file: DiffFile,
  header: DiffHunkHeader,
  rows: Array<Exclude<DiffRow, { kind: 'hunk' }>>,
  selection: DiffSelection,
) {
  const patch = rows.reduce<PatchLineSet>(
    (set, row) => {
      const lineCountBefore = set.lines.length;

      appendRow(file, selection, set, row);

      if (lineCountBefore === set.lines.length && !set.hasSelectedChange) {
        skipLeadingUnchangedRow(set, row);
      }

      return set;
    },
    {
      lines: [],
      oldCount: 0,
      newCount: 0,
      hasSelectedChange: false,
      oldStartOffset: 0,
      newStartOffset: 0,
    },
  );

  if (!patch.hasSelectedChange) {
    return null;
  }

  return [
    formatHunkHeader(
      header.oldStartLine + patch.oldStartOffset,
      patch.oldCount,
      header.newStartLine + patch.newStartOffset,
      patch.newCount,
      header.sectionHeading,
    ),
    ...patch.lines,
  ].join('\n');
}

export function formatPatchFromSelection(file: DiffFile, selection: DiffSelection) {
  const rows = projectDiffRows(file);
  const patchSections: string[] = [];
  let currentHeader: DiffHunkHeader | null = null;
  let currentRows: Array<Exclude<DiffRow, { kind: 'hunk' }>> = [];

  const flushHunk = () => {
    if (currentHeader === null) {
      return;
    }

    const patchSection = formatHunkRows(file, currentHeader, currentRows, selection);

    if (patchSection !== null) {
      patchSections.push(patchSection);
    }

    currentHeader = null;
    currentRows = [];
  };

  for (const row of rows) {
    if (row.kind === 'hunk') {
      flushHunk();
      currentHeader = row.header;
      continue;
    }

    currentRows.push(row);
  }

  flushHunk();

  if (patchSections.length === 0) {
    return null;
  }

  return `${formatFileHeaders(file)}${patchSections.join('\n')}\n`;
}
