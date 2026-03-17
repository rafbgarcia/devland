import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DiffSelection,
  getDiffChangeGroupSelectableLineNumbers,
  type DiffSelectionSide,
  type DiffSelectionType,
  formatPatchFromSelection,
  getSelectableDiffLineNumbers,
  type DiffFile,
  type DiffRow,
} from '@/lib/diff';

type WholeFileSelection = {
  kind: 'whole-file';
  selected: boolean;
};

type LineSelection = {
  kind: 'lines';
  selection: DiffSelection;
};

type FileCommitSelection = WholeFileSelection | LineSelection;

function getStagePaths(file: DiffFile) {
  return [...new Set([file.oldPath, file.newPath].filter((path): path is string => path !== null))];
}

function canSelectByLine(file: DiffFile) {
  return (file.kind === 'text' || file.kind === 'large-text') &&
    getSelectableDiffLineNumbers(file).size > 0;
}

function getSelectionType(selection: FileCommitSelection): DiffSelectionType {
  if (selection.kind === 'whole-file') {
    return selection.selected ? 'all' : 'none';
  }

  return selection.selection.getSelectionType();
}

function getRowLineNumbers(row: DiffRow, side: DiffSelectionSide = 'all') {
  switch (row.kind) {
    case 'hunk':
    case 'context':
      return [];
    case 'added':
      return side === 'old' ? [] : [row.data.originalDiffLineNumber];
    case 'deleted':
      return side === 'new' ? [] : [row.data.originalDiffLineNumber];
    case 'modified':
      if (side === 'old') {
        return [row.before.originalDiffLineNumber];
      }

      if (side === 'new') {
        return [row.after.originalDiffLineNumber];
      }

      return [row.before.originalDiffLineNumber, row.after.originalDiffLineNumber];
  }
}

export type WorkingTreeCommitSelectionState = {
  isSubmitting: boolean;
  error: string | null;
  selectedFileCount: number;
  selectionByPath: Record<string, FileCommitSelection>;
  getFileSelectionType: (path: string) => DiffSelectionType;
  getRowSelectionType: (
    path: string,
    row: DiffRow,
    side?: DiffSelectionSide,
  ) => DiffSelectionType;
  toggleFileSelection: (path: string, nextSelected: boolean) => void;
  toggleHunkSelection: (path: string, hunkStartLineNumber: number, nextSelected: boolean) => void;
  toggleRowSelection: (
    path: string,
    row: DiffRow,
    nextSelected: boolean,
    side?: DiffSelectionSide,
  ) => void;
  commitSelection: (draft: { summary: string; description: string }) => Promise<boolean>;
};

type CommitSelectionPayloadFile = {
  path: string;
  paths: string[];
  kind: 'full' | 'partial';
  patch?: string;
};

export function useWorkingTreeCommitSelection({
  repoPath,
  diffFiles,
  enabled,
}: {
  repoPath: string;
  diffFiles: DiffFile[];
  enabled: boolean;
}): WorkingTreeCommitSelectionState {
  const [selectionByPath, setSelectionByPath] = useState<Record<string, FileCommitSelection>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSelectionByPath({});
      setError(null);
      setIsSubmitting(false);
      return;
    }

    setSelectionByPath((current) =>
      Object.fromEntries(
        diffFiles.map((file) => {
          const previous = current[file.displayPath];

          if (!canSelectByLine(file)) {
            return [
              file.displayPath,
              previous?.kind === 'whole-file'
                ? previous
                : { kind: 'whole-file', selected: true } satisfies WholeFileSelection,
            ];
          }

          const selectableLines = getSelectableDiffLineNumbers(file);

          return [
            file.displayPath,
            previous?.kind === 'lines'
              ? {
                  kind: 'lines',
                  selection: previous.selection.withSelectableLines(selectableLines),
                }
              : {
                  kind: 'lines',
                  selection: DiffSelection.all(selectableLines),
                },
          ];
        }),
      ),
    );
  }, [diffFiles, enabled]);

  const getFileSelectionType = useCallback(
    (path: string): DiffSelectionType => getSelectionType(selectionByPath[path] ?? { kind: 'whole-file', selected: false }),
    [selectionByPath],
  );

  const getRowSelectionType = useCallback(
    (
      path: string,
      row: DiffRow,
      side: DiffSelectionSide = 'all',
    ): DiffSelectionType => {
      const selection = selectionByPath[path];

      if (!selection || selection.kind !== 'lines') {
        return 'none';
      }

      const lineNumbers = getRowLineNumbers(row, side).filter((lineNumber) =>
        selection.selection.isSelectable(lineNumber),
      );

      if (lineNumbers.length === 0) {
        return 'none';
      }

      const selectedCount = lineNumbers.filter((lineNumber) =>
        selection.selection.isSelected(lineNumber),
      ).length;

      if (selectedCount === 0) {
        return 'none';
      }

      if (selectedCount === lineNumbers.length) {
        return 'all';
      }

      return 'partial';
    },
    [selectionByPath],
  );

  const toggleFileSelection = useCallback((path: string, nextSelected: boolean) => {
    setSelectionByPath((current) => {
      const selection = current[path];

      if (!selection) {
        return current;
      }

      return {
        ...current,
        [path]:
          selection.kind === 'whole-file'
            ? { kind: 'whole-file', selected: nextSelected }
            : { kind: 'lines', selection: selection.selection.withSelectionType(nextSelected ? 'all' : 'none') },
      };
    });
    setError(null);
  }, []);

  const toggleHunkSelection = useCallback((
    path: string,
    hunkStartLineNumber: number,
    nextSelected: boolean,
  ) => {
    setSelectionByPath((current) => {
      const selection = current[path];
      const file = diffFiles.find((candidate) => candidate.displayPath === path);

      if (!selection || selection.kind !== 'lines' || !file) {
        return current;
      }

      const selectableLines = getDiffChangeGroupSelectableLineNumbers(file, hunkStartLineNumber);

      if (selectableLines.length === 0) {
        return current;
      }

      return {
        ...current,
        [path]: {
          kind: 'lines',
          selection: selection.selection.withRangeSelection(selectableLines, nextSelected),
        },
      };
    });
    setError(null);
  }, [diffFiles]);

  const toggleRowSelection = useCallback((
    path: string,
    row: DiffRow,
    nextSelected: boolean,
    side: DiffSelectionSide = 'all',
  ) => {
    setSelectionByPath((current) => {
      const selection = current[path];

      if (!selection) {
        return current;
      }

      if (selection.kind === 'whole-file') {
        return {
          ...current,
          [path]: { kind: 'whole-file', selected: nextSelected },
        };
      }

      const lineNumbers = getRowLineNumbers(row, side);

      if (lineNumbers.length === 0) {
        return current;
      }

      return {
        ...current,
        [path]: {
          kind: 'lines',
          selection: selection.selection.withRangeSelection(lineNumbers, nextSelected),
        },
      };
    });
    setError(null);
  }, []);

  const selectedFileCount = useMemo(
    () => diffFiles.filter((file) => getFileSelectionType(file.displayPath) !== 'none').length,
    [diffFiles, getFileSelectionType],
  );

  const commitSelection = useCallback(async (
    draft: { summary: string; description: string },
  ) => {
    const summary = draft.summary.trim();

    if (!enabled || summary.length === 0 || isSubmitting) {
      return false;
    }

    const files: CommitSelectionPayloadFile[] = diffFiles.flatMap((file): CommitSelectionPayloadFile[] => {
      const selection = selectionByPath[file.displayPath];

      if (!selection) {
        return [];
      }

      const selectionType = getSelectionType(selection);

      if (selectionType === 'none') {
        return [];
      }

      if (selection.kind === 'whole-file' || selectionType === 'all') {
        return [{
          path: file.displayPath,
          paths: getStagePaths(file),
          kind: 'full' as const,
        }];
      }

      const patch = formatPatchFromSelection(file, selection.selection);

      if (!patch) {
        return [];
      }

      return [{
        path: file.displayPath,
        paths: getStagePaths(file),
        kind: 'partial' as const,
        patch,
      }];
    });

    if (files.length === 0) {
      setError('Select at least one change to commit.');
      return false;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await window.electronAPI.commitWorkingTreeSelection({
        repoPath,
        summary,
        description: draft.description.trim(),
        files,
      });
      return true;
    } catch (commitError) {
      setError(
        commitError instanceof Error
          ? commitError.message
          : 'Failed to commit the selected changes.',
      );
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [diffFiles, enabled, isSubmitting, repoPath, selectionByPath]);

  return {
    isSubmitting,
    error,
    selectedFileCount,
    selectionByPath,
    getFileSelectionType,
    getRowSelectionType,
    toggleFileSelection,
    toggleHunkSelection,
    toggleRowSelection,
    commitSelection,
  };
}
