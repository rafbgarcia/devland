import type {
  DiffDocument,
  DiffFile,
  DiffFileKind,
  DiffFileStatus,
  DiffHunk,
  DiffHunkHeader,
  DiffLine,
} from '@/lib/diff/types';

const DIFF_GIT_RE = /^diff --git (?:"(.+)"|(\S+)) (?:"(.+)"|(\S+))$/;
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: ?(.*))?$/;

type DiffFileParseState = {
  diffHeaderLine: string;
  lines: string[];
  oldPath: string | null;
  newPath: string | null;
  metadataLines: string[];
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  status: DiffFileStatus;
  kind: DiffFileKind;
  isBinary: boolean;
};

const normalizeDiffPath = (value: string | null): string | null => {
  if (value === null || value === '/dev/null') {
    return null;
  }

  return value.replace(/^[ab]\//, '');
};

const parseDiffHeaderLine = (line: string) => {
  const match = line.match(DIFF_GIT_RE);

  if (!match) {
    throw new Error(`Invalid diff header line: ${line}`);
  }

  return {
    oldPath: normalizeDiffPath(match[1] ?? match[2] ?? null),
    newPath: normalizeDiffPath(match[3] ?? match[4] ?? null),
  };
};

const parseHunkHeader = (line: string): DiffHunkHeader => {
  const match = line.match(HUNK_HEADER_RE);

  if (!match) {
    throw new Error(`Invalid hunk header line: ${line}`);
  }

  return {
    oldStartLine: parseInt(match[1]!, 10),
    oldLineCount: parseInt(match[2] ?? '1', 10),
    newStartLine: parseInt(match[3]!, 10),
    newLineCount: parseInt(match[4] ?? '1', 10),
    sectionHeading: match[5]?.trim() || null,
    text: line,
  };
};

const getDisplayPath = (oldPath: string | null, newPath: string | null) =>
  newPath ?? oldPath ?? '';

const createInitialFileState = (headerLine: string): DiffFileParseState => {
  const { oldPath, newPath } = parseDiffHeaderLine(headerLine);

  return {
    diffHeaderLine: headerLine,
    lines: [headerLine],
    oldPath,
    newPath,
    metadataLines: [],
    hunks: [],
    additions: 0,
    deletions: 0,
    status: 'modified',
    kind: 'text',
    isBinary: false,
  };
};

const finalizeFile = (state: DiffFileParseState): DiffFile => ({
  diffHeaderLine: state.diffHeaderLine,
  rawText: state.lines.join('\n'),
  oldPath: state.oldPath,
  newPath: state.newPath,
  displayPath: getDisplayPath(state.oldPath, state.newPath),
  status: state.status,
  kind: state.kind,
  isBinary: state.isBinary,
  metadataLines: state.metadataLines,
  hunks: state.hunks,
  additions: state.additions,
  deletions: state.deletions,
});

export function parseUnifiedDiffDocument(rawText: string): DiffDocument {
  if (rawText.trim().length === 0) {
    return { rawText, files: [] };
  }

  const lines = rawText.split('\n');
  const files: DiffFile[] = [];
  let currentFile: DiffFileParseState | null = null;
  let currentHunk: DiffHunk | null = null;
  let originalDiffLineNumber = 1;

  const flushHunk = () => {
    if (currentFile !== null && currentHunk !== null) {
      currentFile.hunks.push(currentHunk);
      currentHunk = null;
    }
  };

  const flushFile = () => {
    flushHunk();

    if (currentFile !== null) {
      files.push(finalizeFile(currentFile));
      currentFile = null;
    }

    originalDiffLineNumber = 1;
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flushFile();
      currentFile = createInitialFileState(line);
      continue;
    }

    if (currentFile === null) {
      continue;
    }

    currentFile.lines.push(line);

    if (line.startsWith('Binary files ') || line === 'GIT binary patch') {
      currentFile.isBinary = true;
      currentFile.kind = 'binary';
      currentFile.metadataLines.push(line);
      continue;
    }

    if (line.startsWith('@@ ')) {
      flushHunk();
      currentHunk = {
        header: parseHunkHeader(line),
        originalStartLineNumber: originalDiffLineNumber,
        lines: [],
      };
      originalDiffLineNumber += 1;
      continue;
    }

    if (currentHunk === null) {
      currentFile.metadataLines.push(line);

      if (line.startsWith('new file mode ')) {
        currentFile.status = 'added';
      } else if (line.startsWith('deleted file mode ')) {
        currentFile.status = 'deleted';
      } else if (line.startsWith('rename from ')) {
        currentFile.status = 'renamed';
      } else if (line.startsWith('copy from ')) {
        currentFile.status = 'copied';
      } else if (line.startsWith('--- ')) {
        currentFile.oldPath = normalizeDiffPath(line.slice(4).trim());
      } else if (line.startsWith('+++ ')) {
        currentFile.newPath = normalizeDiffPath(line.slice(4).trim());
      }

      continue;
    }

    if (line === '\\ No newline at end of file') {
      const previousLine = currentHunk.lines.at(-1);

      if (previousLine) {
        previousLine.noTrailingNewline = true;
      }

      continue;
    }

    const prefix = line[0];
    let parsedLine: DiffLine | null = null;

    if (prefix === '+') {
      parsedLine = {
        kind: 'add',
        text: line,
        content: line.slice(1),
        oldLineNumber: null,
        newLineNumber:
          currentHunk.header.newStartLine +
          currentHunk.lines.filter((candidate) => candidate.kind !== 'delete').length,
        originalDiffLineNumber,
        noTrailingNewline: false,
        isSelectable: true,
      };
      currentFile.additions += 1;
    } else if (prefix === '-') {
      parsedLine = {
        kind: 'delete',
        text: line,
        content: line.slice(1),
        oldLineNumber:
          currentHunk.header.oldStartLine +
          currentHunk.lines.filter((candidate) => candidate.kind !== 'add').length,
        newLineNumber: null,
        originalDiffLineNumber,
        noTrailingNewline: false,
        isSelectable: true,
      };
      currentFile.deletions += 1;
    } else if (prefix === ' ') {
      const oldLineNumber =
        currentHunk.header.oldStartLine +
        currentHunk.lines.filter((candidate) => candidate.kind !== 'add').length;
      const newLineNumber =
        currentHunk.header.newStartLine +
        currentHunk.lines.filter((candidate) => candidate.kind !== 'delete').length;

      parsedLine = {
        kind: 'context',
        text: line,
        content: line.slice(1),
        oldLineNumber,
        newLineNumber,
        originalDiffLineNumber,
        noTrailingNewline: false,
        isSelectable: false,
      };
    }

    if (parsedLine !== null) {
      currentHunk.lines.push(parsedLine);
      originalDiffLineNumber += 1;
    }
  }

  flushFile();

  return { rawText, files };
}
