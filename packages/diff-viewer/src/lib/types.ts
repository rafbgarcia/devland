import type { FileDiffMetadata } from '@pierre/diffs';

export type DiffFileKind = 'text' | 'binary';
export type DiffCommentSide = 'old' | 'new';

export type DiffFileStatus =
  | 'added'
  | 'copied'
  | 'deleted'
  | 'modified'
  | 'renamed'
  | 'untracked';

export type DiffLineUnit = {
  side: DiffCommentSide;
  lineNumber: number;
  content: string;
  noTrailingNewline: boolean;
};

export type DiffHunk = {
  id: string;
  hunkIndex: number;
  headerText: string;
  oldStartLine: number;
  oldLineCount: number;
  newStartLine: number;
  newLineCount: number;
  sectionHeading: string | null;
};

export type DiffRow =
  | {
      id: string;
      kind: 'hunk';
      hunkIndex: number;
      headerText: string;
      hunk: DiffHunk;
    }
  | {
      id: string;
      kind: 'context';
      hunkIndex: number;
      content: string;
      beforeLineNumber: number;
      afterLineNumber: number;
      noTrailingNewline: boolean;
    }
  | {
      id: string;
      kind: 'added';
      hunkIndex: number;
      data: DiffLineUnit;
    }
  | {
      id: string;
      kind: 'deleted';
      hunkIndex: number;
      data: DiffLineUnit;
    }
  | {
      id: string;
      kind: 'modified';
      hunkIndex: number;
      before: DiffLineUnit;
      after: DiffLineUnit;
    };

export type DiffFile = {
  id: string;
  rawPatch: string;
  headerLines: readonly string[];
  oldPath: string | null;
  newPath: string | null;
  displayPath: string;
  status: DiffFileStatus;
  kind: DiffFileKind;
  additions: number;
  deletions: number;
  metadata: FileDiffMetadata | null;
  hunks: readonly DiffHunk[];
  rows: readonly DiffRow[];
};

export type DiffDocument = {
  rawPatch: string;
  files: readonly DiffFile[];
};

export type DiffFileSummary = {
  path: string;
  oldPath: string | null;
  newPath: string | null;
  status: DiffFileStatus;
  additions: number;
  deletions: number;
  kind: DiffFileKind;
};

export type DiffCommentAnchor = {
  path: string;
  oldPath: string | null;
  newPath: string | null;
  side: DiffCommentSide;
  line: number;
  startLine: number;
  endLine: number;
  excerpt: string[];
};
