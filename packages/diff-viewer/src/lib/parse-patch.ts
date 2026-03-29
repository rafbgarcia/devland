import { processFile } from '@pierre/diffs';
import type { ChangeTypes, FileDiffMetadata, Hunk } from '@pierre/diffs';

import type {
  DiffDocument,
  DiffFile,
  DiffFileKind,
  DiffFileStatus,
  DiffHunk,
  DiffLineUnit,
  DiffRow,
} from './types.js';

const DIFF_PATH_PREFIX_RE = /^(?:a|b|c|i|o|w|1|2)\//;
const DIFF_SECTION_START = /^diff --git /;
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: ?(.*))?$/;

function normalizeDiffPath(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed === '/dev/null') {
    return null;
  }

  return trimmed.replace(DIFF_PATH_PREFIX_RE, '');
}

function deriveStatus(type: ChangeTypes): DiffFileStatus {
  switch (type) {
    case 'new':
      return 'added';
    case 'deleted':
      return 'deleted';
    case 'rename-pure':
    case 'rename-changed':
      return 'renamed';
    case 'change':
      return 'modified';
  }

  return 'modified';
}

function splitPatchSections(rawPatch: string) {
  if (rawPatch.trim().length === 0) {
    return [] as string[];
  }

  const lines = rawPatch.split('\n');
  const sections: string[] = [];
  let currentSectionLines: string[] = [];

  for (const line of lines) {
    if (DIFF_SECTION_START.test(line)) {
      if (currentSectionLines.length > 0) {
        sections.push(currentSectionLines.join('\n'));
      }

      currentSectionLines = [line];
      continue;
    }

    if (currentSectionLines.length > 0) {
      currentSectionLines.push(line);
    }
  }

  if (currentSectionLines.length > 0) {
    sections.push(currentSectionLines.join('\n'));
  }

  return sections;
}

function getHeaderLines(section: string) {
  const lines = section.split('\n');
  const firstHunkIndex = lines.findIndex((line) => line.startsWith('@@ '));

  return firstHunkIndex === -1 ? lines : lines.slice(0, firstHunkIndex);
}

function toCanonicalGitPath(value: string, side: 'old' | 'new') {
  const normalizedPath = normalizeDiffPath(value);

  if (normalizedPath === null) {
    return '/dev/null';
  }

  return `${side === 'old' ? 'a' : 'b'}/${normalizedPath}`;
}

function canonicalizeGitDiffSection(section: string) {
  return section
    .split('\n')
    .map((line, index) => {
      if (index === 0 && line.startsWith('diff --git ')) {
        const match = line.match(/^diff --git (\S+) (\S+)$/);

        if (!match) {
          return line;
        }

        const oldPath = match[1]!;
        const newPath = match[2]!;
        return `diff --git ${toCanonicalGitPath(oldPath, 'old')} ${toCanonicalGitPath(newPath, 'new')}`;
      }

      if (line.startsWith('--- ')) {
        return `--- ${toCanonicalGitPath(line.slice(4), 'old')}`;
      }

      if (line.startsWith('+++ ')) {
        return `+++ ${toCanonicalGitPath(line.slice(4), 'new')}`;
      }

      return line;
    })
    .join('\n');
}

function derivePaths(metadata: FileDiffMetadata | null, headerLines: readonly string[]) {
  let oldPath = metadata?.prevName ? normalizeDiffPath(metadata.prevName) : null;
  let newPath = metadata ? normalizeDiffPath(metadata.name) : null;

  for (const line of headerLines) {
    if (line.startsWith('--- ')) {
      oldPath = normalizeDiffPath(line.slice(4));
    } else if (line.startsWith('+++ ')) {
      newPath = normalizeDiffPath(line.slice(4));
    }
  }

  const displayPath = newPath ?? oldPath ?? metadata?.name ?? '';

  return {
    oldPath,
    newPath,
    displayPath,
  };
}

function stripTrailingLineBreak(value: string) {
  return value.replace(/\r?\n$/, '');
}

function createLineUnit(
  side: 'old' | 'new',
  lineNumber: number,
  content: string,
): DiffLineUnit {
  return {
    side,
    lineNumber,
    content: stripTrailingLineBreak(content),
    noTrailingNewline: false,
  };
}

function createHunkHeaderText(hunk: Hunk) {
  if (hunk.hunkSpecs) {
    return hunk.hunkSpecs;
  }

  const oldRange = hunk.deletionCount === 1
    ? `${hunk.deletionStart}`
    : `${hunk.deletionStart},${hunk.deletionCount}`;
  const newRange = hunk.additionCount === 1
    ? `${hunk.additionStart}`
    : `${hunk.additionStart},${hunk.additionCount}`;
  const heading = hunk.hunkContext ? ` ${hunk.hunkContext}` : '';

  return `@@ -${oldRange} +${newRange} @@${heading}`;
}

function parseSectionHeading(headerText: string) {
  const match = headerText.match(HUNK_HEADER_RE);
  return match?.[5]?.trim() || null;
}

function buildFileHunks(fileDiff: FileDiffMetadata) {
  const rows: DiffRow[] = [];
  const hunks: DiffHunk[] = [];

  fileDiff.hunks.forEach((hunk, hunkIndex) => {
    const oldLinesInHunk: DiffLineUnit[] = [];
    const newLinesInHunk: DiffLineUnit[] = [];
    const headerText = createHunkHeaderText(hunk);
    let currentOldLineNumber = hunk.deletionStart;
    let currentNewLineNumber = hunk.additionStart;

    const hunkModel: DiffHunk = {
      id: `hunk:${hunkIndex}`,
      hunkIndex,
      headerText,
      oldStartLine: hunk.deletionStart,
      oldLineCount: hunk.deletionCount,
      newStartLine: hunk.additionStart,
      newLineCount: hunk.additionCount,
      sectionHeading: parseSectionHeading(headerText),
    };

    rows.push({
      id: `row:hunk:${hunkIndex}`,
      kind: 'hunk',
      hunkIndex,
      headerText,
      hunk: hunkModel,
    });

    hunk.hunkContent.forEach((content, contentIndex) => {
      if (content.type === 'context') {
        for (let offset = 0; offset < content.lines; offset += 1) {
          const contentText =
            fileDiff.deletionLines[content.deletionLineIndex + offset] ??
            fileDiff.additionLines[content.additionLineIndex + offset] ??
            '';

          rows.push({
            id: `row:context:${hunkIndex}:${contentIndex}:${offset}`,
            kind: 'context',
            hunkIndex,
            content: stripTrailingLineBreak(contentText),
            beforeLineNumber: currentOldLineNumber,
            afterLineNumber: currentNewLineNumber,
            noTrailingNewline: false,
          });

          currentOldLineNumber += 1;
          currentNewLineNumber += 1;
        }

        return;
      }

      const sharedLineCount = Math.min(content.deletions, content.additions);

      for (let offset = 0; offset < sharedLineCount; offset += 1) {
        const before = createLineUnit(
          'old',
          currentOldLineNumber,
          fileDiff.deletionLines[content.deletionLineIndex + offset] ?? '',
        );
        const after = createLineUnit(
          'new',
          currentNewLineNumber,
          fileDiff.additionLines[content.additionLineIndex + offset] ?? '',
        );

        oldLinesInHunk.push(before);
        newLinesInHunk.push(after);

        rows.push({
          id: `row:modified:${hunkIndex}:${contentIndex}:${offset}`,
          kind: 'modified',
          hunkIndex,
          before,
          after,
        });

        currentOldLineNumber += 1;
        currentNewLineNumber += 1;
      }

      for (let offset = sharedLineCount; offset < content.deletions; offset += 1) {
        const data = createLineUnit(
          'old',
          currentOldLineNumber,
          fileDiff.deletionLines[content.deletionLineIndex + offset] ?? '',
        );

        oldLinesInHunk.push(data);

        rows.push({
          id: `row:deleted:${hunkIndex}:${contentIndex}:${offset}`,
          kind: 'deleted',
          hunkIndex,
          data,
        });

        currentOldLineNumber += 1;
      }

      for (let offset = sharedLineCount; offset < content.additions; offset += 1) {
        const data = createLineUnit(
          'new',
          currentNewLineNumber,
          fileDiff.additionLines[content.additionLineIndex + offset] ?? '',
        );

        newLinesInHunk.push(data);

        rows.push({
          id: `row:added:${hunkIndex}:${contentIndex}:${offset}`,
          kind: 'added',
          hunkIndex,
          data,
        });

        currentNewLineNumber += 1;
      }
    });

    if (hunk.noEOFCRDeletions) {
      const lastOldLine = oldLinesInHunk.at(-1);
      if (lastOldLine) {
        lastOldLine.noTrailingNewline = true;
      } else {
        const lastContextRow = [...rows]
          .reverse()
          .find((row): row is Extract<DiffRow, { kind: 'context' }> =>
            row.hunkIndex === hunkIndex && row.kind === 'context',
          );
        if (lastContextRow) {
          lastContextRow.noTrailingNewline = true;
        }
      }
    }

    if (hunk.noEOFCRAdditions) {
      const lastNewLine = newLinesInHunk.at(-1);
      if (lastNewLine) {
        lastNewLine.noTrailingNewline = true;
      } else {
        const lastContextRow = [...rows]
          .reverse()
          .find((row): row is Extract<DiffRow, { kind: 'context' }> =>
            row.hunkIndex === hunkIndex && row.kind === 'context',
          );
        if (lastContextRow) {
          lastContextRow.noTrailingNewline = true;
        }
      }
    }

    hunks.push(hunkModel);
  });

  return { hunks, rows };
}

function detectFileKind(section: string, metadata: FileDiffMetadata | null): DiffFileKind {
  if (metadata === null) {
    return section.includes('Binary files ') || section.includes('GIT binary patch')
      ? 'binary'
      : 'text';
  }

  return metadata.hunks.length === 0 &&
    (section.includes('Binary files ') || section.includes('GIT binary patch'))
    ? 'binary'
    : 'text';
}

function countFileChanges(metadata: FileDiffMetadata | null) {
  if (metadata === null) {
    return { additions: 0, deletions: 0 };
  }

  return metadata.hunks.reduce(
    (counts, hunk) => ({
      additions: counts.additions + hunk.additionLines,
      deletions: counts.deletions + hunk.deletionLines,
    }),
    { additions: 0, deletions: 0 },
  );
}

function parseDiffSection(section: string, index: number): DiffFile | null {
  let metadata: FileDiffMetadata | null = null;

  try {
    metadata = processFile(canonicalizeGitDiffSection(section), {
      isGitDiff: true,
      throwOnError: false,
    }) ?? null;
  } catch {
    metadata = null;
  }

  const headerLines = getHeaderLines(section);
  const { oldPath, newPath, displayPath } = derivePaths(metadata, headerLines);
  const status = metadata === null ? 'modified' : deriveStatus(metadata.type);
  const kind = detectFileKind(section, metadata);
  const { additions, deletions } = countFileChanges(metadata);
  const { hunks, rows } = metadata === null ? { hunks: [] as DiffHunk[], rows: [] as DiffRow[] } : buildFileHunks(metadata);

  if (displayPath.length === 0 && headerLines.length === 0) {
    return null;
  }

  return {
    id: `file:${index}:${displayPath}`,
    rawPatch: section,
    headerLines,
    oldPath,
    newPath,
    displayPath,
    status,
    kind,
    additions,
    deletions,
    metadata,
    hunks,
    rows,
  };
}

export function parsePatchDocument(rawPatch: string): DiffDocument {
  const files = splitPatchSections(rawPatch)
    .map((section, index) => parseDiffSection(section, index))
    .filter((file): file is DiffFile => file !== null);

  return {
    rawPatch,
    files,
  };
}

export function getPatchFileSummaries(rawPatch: string) {
  return parsePatchDocument(rawPatch).files.map((file) => ({
    path: file.displayPath,
    oldPath: file.oldPath,
    newPath: file.newPath,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    kind: file.kind,
  }));
}
