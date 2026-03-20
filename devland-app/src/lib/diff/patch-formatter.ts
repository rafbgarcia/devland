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

function appendRow(
  file: DiffFile,
  selection: DiffSelection,
  set: PatchLineSet,
  line: DiffLine,
) {
  switch (line.kind) {
    case 'context':
      pushContextLine(set, line.content);
      break;
    case 'delete': {
      const isSelected = selection.isSelected(line.originalDiffLineNumber);

      if (isSelected) {
        pushDeletedLine(set, line.content, line.noTrailingNewline);
      } else {
        pushContextLine(set, line.content);
      }
      break;
    }
    case 'add': {
      const isSelected = selection.isSelected(line.originalDiffLineNumber);

      if (isSelected) {
        pushAddedLine(set, line.content, line.noTrailingNewline);
      } else if (file.status !== 'added' && file.status !== 'untracked') {
        // Unselected additions disappear from the patch.
      }
      break;
    }
  }
}

function formatHunkRows(
  file: DiffFile,
  hunk: DiffHunk,
  selection: DiffSelection,
) {
  const patch = hunk.lines.reduce<PatchLineSet>(
    (set, line) => {
      appendRow(file, selection, set, line);
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
    const patchSection = formatHunkRows(file, hunk, selection);

    if (patchSection !== null) {
      patchSections.push(patchSection);
    }
  }

  if (patchSections.length === 0) {
    return null;
  }

  return `${formatFileHeaders(file)}${patchSections.join('\n')}\n`;
}
