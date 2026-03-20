export type DiffFileKind = 'text' | 'binary' | 'image' | 'large-text' | 'unrenderable';
export type DiffDisplayMode = 'unified' | 'side-by-side';
export type DiffSelectionSide = 'all' | 'old' | 'new';

export type DiffFileStatus =
  | 'added'
  | 'copied'
  | 'deleted'
  | 'modified'
  | 'renamed'
  | 'untracked';

export type DiffLineKind = 'context' | 'add' | 'delete';

export type DiffDocument = {
  rawText: string;
  files: DiffFile[];
};

export type DiffFileHeader = {
  diffHeaderLine: string;
  oldPath: string | null;
  newPath: string | null;
  displayPath: string;
  status: DiffFileStatus;
  kind: DiffFileKind;
  isBinary: boolean;
  metadataLines: string[];
};

export type DiffFile = DiffFileHeader & {
  rawText: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
};

export type DiffHunkHeader = {
  oldStartLine: number;
  oldLineCount: number;
  newStartLine: number;
  newLineCount: number;
  sectionHeading: string | null;
  text: string;
};

export type DiffHunk = {
  header: DiffHunkHeader;
  originalStartLineNumber: number;
  lines: DiffLine[];
};

export type DiffLine = {
  kind: DiffLineKind;
  text: string;
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  originalDiffLineNumber: number;
  noTrailingNewline: boolean;
  isSelectable: boolean;
};

export type DiffChangedLine = {
  content: string;
  lineNumber: number;
  originalDiffLineNumber: number;
  noTrailingNewline: boolean;
  isSelectable: boolean;
};

export type DiffRow =
  | {
      kind: 'hunk';
      content: string;
      originalStartLineNumber: number;
      header: DiffHunkHeader;
    }
  | {
      kind: 'context';
      content: string;
      beforeLineNumber: number;
      afterLineNumber: number;
      originalDiffLineNumber: number;
    }
  | {
      kind: 'added';
      changeGroupStartLineNumber: number;
      data: DiffChangedLine;
    }
  | {
      kind: 'deleted';
      changeGroupStartLineNumber: number;
      data: DiffChangedLine;
    }
  | {
      kind: 'modified';
      changeGroupStartLineNumber: number;
      canIntraLineDiff: boolean;
      before: DiffChangedLine;
      after: DiffChangedLine;
    };
