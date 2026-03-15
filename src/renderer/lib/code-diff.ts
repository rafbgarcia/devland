type DiffLineType = 'addition' | 'deletion' | 'context';

export type ParsedDiffLine = {
  type: DiffLineType;
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
};

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const DIFF_HEADER_RE = /^diff --git (?:"(.+)"|(\S+)) (?:"(.+)"|(\S+))$/;

function normalizeDiffPath(path: string) {
  return path.replace(/^[^/]+\//, '');
}

function getDiffHeaderPath(section: string) {
  const headerLine = section.split('\n', 1)[0];
  const match = headerLine?.match(DIFF_HEADER_RE);
  const nextPath = match?.[3] ?? match?.[4];

  return nextPath ? normalizeDiffPath(nextPath) : null;
}

function shouldSkipDiffMetadataLine(line: string) {
  return (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('---') ||
    line.startsWith('+++') ||
    line.startsWith('new file') ||
    line.startsWith('old mode') ||
    line.startsWith('new mode') ||
    line.startsWith('similarity') ||
    line.startsWith('rename') ||
    line.startsWith('deleted file') ||
    line.startsWith('\\ No newline')
  );
}

export function parseDiff(raw: string): ParsedDiffLine[] {
  const lines = raw.split('\n');
  const result: ParsedDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    const hunkMatch = line.match(HUNK_HEADER_RE);

    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1]!, 10);
      newLine = parseInt(hunkMatch[2]!, 10);
      continue;
    }

    if (shouldSkipDiffMetadataLine(line)) {
      continue;
    }

    if (line.startsWith('+')) {
      result.push({
        type: 'addition',
        content: line.slice(1),
        oldLineNumber: null,
        newLineNumber: newLine,
      });
      newLine++;
      continue;
    }

    if (line.startsWith('-')) {
      result.push({
        type: 'deletion',
        content: line.slice(1),
        oldLineNumber: oldLine,
        newLineNumber: null,
      });
      oldLine++;
      continue;
    }

    if (oldLine > 0 || newLine > 0) {
      result.push({
        type: 'context',
        content: line.startsWith(' ') ? line.slice(1) : line,
        oldLineNumber: oldLine,
        newLineNumber: newLine,
      });
      oldLine++;
      newLine++;
    }
  }

  return result;
}

export { type DiffLineType };

export type DiffFileStatus = 'added' | 'deleted' | 'renamed' | 'modified';

export type DiffFile = {
  path: string;
  status: DiffFileStatus;
  additions: number;
  deletions: number;
  rawDiff: string;
  renderLineCount: number;
};

export function parseDiffFiles(rawDiff: string): DiffFile[] {
  const fileSections = rawDiff.split(/^(?=diff --git )/m);
  const files: DiffFile[] = [];

  for (const section of fileSections) {
    if (!section.startsWith('diff --git ')) continue;

    const filePath = getDiffHeaderPath(section);
    if (!filePath) continue;

    let status: DiffFileStatus = 'modified';
    if (section.includes('\nnew file mode ')) status = 'added';
    else if (section.includes('\ndeleted file mode ')) status = 'deleted';
    else if (section.includes('\nrename from ')) status = 'renamed';

    let additions = 0;
    let deletions = 0;
    let renderLineCount = 0;
    let oldLine = 0;
    let newLine = 0;

    for (const line of section.split('\n')) {
      const hunkMatch = line.match(HUNK_HEADER_RE);

      if (hunkMatch) {
        oldLine = parseInt(hunkMatch[1]!, 10);
        newLine = parseInt(hunkMatch[2]!, 10);
        continue;
      }

      if (shouldSkipDiffMetadataLine(line)) {
        continue;
      }

      if (line.startsWith('+')) {
        additions++;
        renderLineCount++;
        newLine++;
        continue;
      }

      if (line.startsWith('-')) {
        deletions++;
        renderLineCount++;
        oldLine++;
        continue;
      }

      if (oldLine > 0 || newLine > 0) {
        renderLineCount++;
        oldLine++;
        newLine++;
      }
    }

    files.push({
      path: filePath,
      status,
      additions,
      deletions,
      rawDiff: section,
      renderLineCount,
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  return files;
}
