import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DiffSelection,
  type DiffSelectionType,
  formatPatchFromSelection,
  getSelectableDiffLineNumbers,
  type DiffRow,
} from '@/lib/diff';
import type { DiffFile } from '@/lib/diff/types';
import type { DiffRenderFile } from '@/renderer/hooks/use-diff-render-files';

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

function canSelectByLine(file: DiffRenderFile) {
  return (file.diff.kind === 'text' || file.diff.kind === 'large-text') &&
    getSelectableDiffLineNumbers(file.diff).size > 0;
}

function getSelectionType(selection: FileCommitSelection): DiffSelectionType {
  if (selection.kind === 'whole-file') {
    return selection.selected ? 'all' : 'none';
  }

  return selection.selection.getSelectionType();
}

function getRowLineNumbers(row: DiffRow) {
  switch (row.kind) {
    case 'hunk':
    case 'context':
      return [];
    case 'added':
    case 'deleted':
      return [row.data.originalDiffLineNumber];
    case 'modified':
      return [row.before.originalDiffLineNumber, row.after.originalDiffLineNumber];
  }
}

export type WorkingTreeCommitSelectionState = {
  isSubmitting: boolean;
  error: string | null;
  selectedFileCount: number;
  selectionByPath: Record<string, FileCommitSelection>;
  getFileSelectionType: (path: string) => DiffSelectionType;
  getRowSelectionType: (path: string, row: DiffRow) => DiffSelectionType;
  toggleFileSelection: (path: string, nextSelected: boolean) => void;
  toggleHunkSelection: (path: string, hunkStartLineNumber: number, nextSelected: boolean) => void;
  toggleRowSelection: (path: string, row: DiffRow, nextSelected: boolean) => void;
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
  diffFiles: DiffRenderFile[];
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
          const previous = current[file.path];

          if (!canSelectByLine(file)) {
            return [
              file.path,
              previous?.kind === 'whole-file'
                ? previous
                : { kind: 'whole-file', selected: true } satisfies WholeFileSelection,
            ];
          }

          const selectableLines = getSelectableDiffLineNumbers(file.diff);

          return [
            file.path,
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
    (path: string, row: DiffRow): DiffSelectionType => {
      const selection = selectionByPath[path];

      if (!selection || selection.kind !== 'lines') {
        return 'none';
      }

      const lineNumbers = getRowLineNumbers(row).filter((lineNumber) =>
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
      const file = diffFiles.find((candidate) => candidate.path === path);

      if (!selection || selection.kind !== 'lines' || !file) {
        return current;
      }

      const hunk = file.diff.hunks.find(
        (candidate) => candidate.originalStartLineNumber === hunkStartLineNumber,
      );

      if (!hunk) {
        return current;
      }

      const selectableLines = hunk.lines
        .filter((line) => line.isSelectable)
        .map((line) => line.originalDiffLineNumber);

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

  const toggleRowSelection = useCallback((path: string, row: DiffRow, nextSelected: boolean) => {
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

      const lineNumbers = getRowLineNumbers(row);

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
    () => diffFiles.filter((file) => getFileSelectionType(file.path) !== 'none').length,
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
      const selection = selectionByPath[file.path];

      if (!selection) {
        return [];
      }

      const selectionType = getSelectionType(selection);

      if (selectionType === 'none') {
        return [];
      }

      if (selection.kind === 'whole-file' || selectionType === 'all') {
        return [{
          path: file.path,
          paths: getStagePaths(file.diff),
          kind: 'full' as const,
        }];
      }

      const patch = formatPatchFromSelection(file.diff, selection.selection);

      if (!patch) {
        return [];
      }

      return [{
        path: file.path,
        paths: getStagePaths(file.diff),
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
