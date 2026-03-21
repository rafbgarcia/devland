import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { GitStatusFile, PrCommit } from '@/ipc/contracts';
import {
  getDiffChangeGroupSelectableLineNumbers,
  type DiffCommentAnchor,
  type DiffSelectionSide,
} from '@/lib/diff';
import {
  sortWorkingTreeFiles,
  type CodexChangeSortMode,
} from '@/renderer/code-screen/codex-change-order';
import { ChangesSidebar } from '@/renderer/code-screen/changes-sidebar';
import {
  useGitBranchHistory,
  useGitCommitDiff,
  useGitWorkingTreeDiff,
} from '@/renderer/code-screen/use-git-code-changes';
import { useWorkingTreeCommitSelection } from '@/renderer/code-screen/use-working-tree-commit-selection';
import { getParsedDiffFiles } from '@/renderer/shared/ui/diff/parsed-diff-files';
import { SingleFileDiffView } from '@/renderer/shared/ui/diff/single-file-diff-view';
import { getExpandedDiffHighlightLineFilters } from '@/renderer/shared/ui/diff/diff-expansion';
import { useDiffExpansionState } from '@/renderer/shared/ui/diff/use-diff-expansion-state';
import { useDiffRenderFiles } from '@/renderer/shared/ui/diff/use-diff-render-files';

function lineFiltersEqual(left: readonly number[], right: readonly number[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function expandedHighlightFiltersEqual(
  left: { oldLineFilter: readonly number[]; newLineFilter: readonly number[] } | undefined,
  right: { oldLineFilter: readonly number[]; newLineFilter: readonly number[] },
) {
  return left !== undefined &&
    lineFiltersEqual(left.oldLineFilter, right.oldLineFilter) &&
    lineFiltersEqual(left.newLineFilter, right.newLineFilter);
}

type CodeChangesSelection =
  | { type: 'working-tree' }
  | { type: 'commit'; commit: PrCommit };

type CodeChangesRenderProps = {
  sidebar: ReactNode;
  viewport: ReactNode;
};

function toWorkingTreeSidebarFiles(
  files: GitStatusFile[],
  sortMode: CodexChangeSortMode,
  codexTouchSequenceByPath: Readonly<Record<string, number>>,
) {
  return sortWorkingTreeFiles(files, sortMode, codexTouchSequenceByPath)
    .map((file) => ({
      path: file.path,
      status: file.status,
      additions: 0,
      deletions: 0,
    }));
}

function ActiveDiffViewport({
  rawDiff,
  renderContext,
  selectedFilePath,
  emptyMessage,
  isWorkingTreeSelection,
  getRowSelectionType,
  getHunkSelectionType,
  onToggleRowSelection,
  onToggleHunkSelection,
  onSubmitComment,
}: {
  rawDiff: ReturnType<typeof useGitWorkingTreeDiff>['rawDiff'] | ReturnType<typeof useGitCommitDiff>['rawDiff'];
  renderContext:
    | { kind: 'working-tree'; repoPath: string }
    | { kind: 'commit'; repoPath: string; commitRevision: string; parentRevision: string | null }
    | null;
  selectedFilePath: string | null;
  emptyMessage: string;
  isWorkingTreeSelection: boolean;
  getRowSelectionType: ReturnType<typeof useWorkingTreeCommitSelection>['getRowSelectionType'];
  getHunkSelectionType: (path: string, hunkStartLineNumber: number) => 'none' | 'all' | 'partial';
  onToggleRowSelection: (
    path: string,
    row: Parameters<ReturnType<typeof useWorkingTreeCommitSelection>['toggleRowSelection']>[1],
    side?: DiffSelectionSide,
  ) => void;
  onToggleHunkSelection: (path: string, hunkStartLineNumber: number) => void;
  onSubmitComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
}) {
  const highlightPaths = useMemo(
    () => selectedFilePath === null ? [] : [selectedFilePath],
    [selectedFilePath],
  );
  const { getFileExpansionState, expandFileGap } = useDiffExpansionState(rawDiff);
  const [highlightLineNumbersByPath, setHighlightLineNumbersByPath] = useState<
    Record<string, { oldLineFilter: number[]; newLineFilter: number[] }>
  >({});
  const renderFiles = useDiffRenderFiles({
    rawDiff,
    context: renderContext,
    highlightPaths,
    highlightLineNumbersByPath,
  });
  const selectedFile = useMemo(
    () =>
      selectedFilePath === null
        ? null
        : (renderFiles.find((file) => file.path === selectedFilePath) ?? null),
    [renderFiles, selectedFilePath],
  );
  const selectedFileExpansionState = useMemo(
    () => selectedFilePath === null ? undefined : getFileExpansionState(selectedFilePath),
    [getFileExpansionState, selectedFilePath],
  );

  useEffect(() => {
    if (selectedFile === null) {
      setHighlightLineNumbersByPath((current) => Object.keys(current).length === 0 ? current : {});
      return;
    }

    const nextHighlightFilters = getExpandedDiffHighlightLineFilters({
      file: selectedFile.diff,
      rows: selectedFile.rows,
      contents: selectedFile.contents,
      expansionState: selectedFileExpansionState,
    });
    const hasVisibleExpandedContext =
      nextHighlightFilters.oldLineFilter.length > 0 || nextHighlightFilters.newLineFilter.length > 0;

    setHighlightLineNumbersByPath((current) => {
      if (!hasVisibleExpandedContext) {
        return Object.keys(current).length === 0 ? current : {};
      }

      const currentSelection = current[selectedFile.path];
      if (
        Object.keys(current).length === 1 &&
        expandedHighlightFiltersEqual(currentSelection, nextHighlightFilters)
      ) {
        return current;
      }

      return {
        [selectedFile.path]: nextHighlightFilters,
      };
    });
  }, [selectedFile, selectedFileExpansionState]);

  return (
    <SingleFileDiffView
      rawDiff={rawDiff}
      selectedFile={selectedFile}
      emptyMessage={emptyMessage}
      getRowSelectionType={isWorkingTreeSelection ? getRowSelectionType : undefined}
      getHunkSelectionType={isWorkingTreeSelection ? getHunkSelectionType : undefined}
      onToggleRowSelection={isWorkingTreeSelection ? onToggleRowSelection : undefined}
      onToggleHunkSelection={isWorkingTreeSelection ? onToggleHunkSelection : undefined}
      onSubmitComment={onSubmitComment}
      expansionState={selectedFileExpansionState}
      onExpandGap={
        selectedFile
          ? (gap, action) => expandFileGap(selectedFile.path, gap, action)
          : undefined
      }
    />
  );
}

export function ChangesPane({
  repoPath,
  baseBranchName,
  branchName,
  headRevision,
  workingTreeFiles,
  workingTreeSortMode,
  codexTouchSequenceByPath,
  onToggleWorkingTreeSortMode,
  workingTreeStatusRefreshVersion,
  isViewportActive,
  children,
  onFileSelect,
  onSubmitDiffComment,
}: {
  repoPath: string;
  baseBranchName: string;
  branchName: string;
  headRevision: string | null;
  workingTreeFiles: GitStatusFile[];
  workingTreeSortMode: CodexChangeSortMode;
  codexTouchSequenceByPath: Readonly<Record<string, number>>;
  onToggleWorkingTreeSortMode: () => void;
  workingTreeStatusRefreshVersion: number;
  isViewportActive: boolean;
  children: (props: CodeChangesRenderProps) => ReactNode;
  onFileSelect?: () => void;
  onSubmitDiffComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
}) {
  const [selection, setSelection] = useState<CodeChangesSelection>({ type: 'working-tree' });
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  const { historyState } = useGitBranchHistory({
    repoPath,
    branchName,
    headRevision,
  });
  const workingTreeState = useGitWorkingTreeDiff({
    repoPath,
    files: workingTreeFiles,
    refreshVersion: workingTreeStatusRefreshVersion,
  });
  const commitDiffState = useGitCommitDiff({
    repoPath,
    commitSha: selection.type === 'commit' ? selection.commit.sha : null,
  });

  useEffect(() => {
    setSelection({ type: 'working-tree' });
    setSelectedFilePath(null);
  }, [baseBranchName, branchName, repoPath]);

  const activeDiffState = selection.type === 'working-tree'
    ? workingTreeState.rawDiff
    : commitDiffState.rawDiff;
  const emptyMessage = selection.type === 'working-tree'
    ? (activeDiffState.status === 'loading' ? '' : 'Working tree is clean.')
    : (activeDiffState.status === 'loading' ? '' : 'No file changes in this commit.');
  const historyCommits = historyState.status === 'ready'
    ? historyState.data.commits
    : [];
  const selectedCommit = selection.type === 'commit' ? selection.commit : null;
  const historySelectedCommitSha = selectedCommit?.sha ?? null;
  const historyIsLoading = historyState.status === 'loading' && historyState.data === null;
  const historyIsRefreshing = historyState.isRefreshing;
  const historyError = historyState.status === 'error'
    ? historyState.error
    : null;

  const renderContext = useMemo(() => {
    if (selection.type === 'working-tree') {
      return { kind: 'working-tree', repoPath } as const;
    }

    if (selectedCommit === null) {
      return null;
    }

    return {
      kind: 'commit',
      repoPath,
      commitRevision: selectedCommit.sha,
      parentRevision: commitDiffState.parentRevision,
    } as const;
  }, [commitDiffState.parentRevision, repoPath, selectedCommit, selection.type]);
  const activeDiffFiles = useMemo(
    () => (activeDiffState.status === 'ready' ? getParsedDiffFiles(activeDiffState.data) : []),
    [activeDiffState],
  );
  const workingTreeSidebarFiles = useMemo(
    () => toWorkingTreeSidebarFiles(
      workingTreeFiles,
      workingTreeSortMode,
      codexTouchSequenceByPath,
    ),
    [codexTouchSequenceByPath, workingTreeFiles, workingTreeSortMode],
  );
  const activeSidebarFiles = selection.type === 'working-tree'
    ? workingTreeSidebarFiles
    : activeDiffFiles.map((file) => ({
        path: file.displayPath,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
      }));

  useEffect(() => {
    if (activeSidebarFiles.length === 0) {
      if (selectedFilePath !== null) {
        setSelectedFilePath(null);
      }
      return;
    }

    if (
      selectedFilePath !== null &&
      activeSidebarFiles.some((file) => file.path === selectedFilePath)
    ) {
      return;
    }

    setSelectedFilePath(activeSidebarFiles[0]?.path ?? null);
  }, [activeSidebarFiles, selectedFilePath]);

  const workingTreeCommitSelection = useWorkingTreeCommitSelection({
    repoPath,
    diffFiles: selection.type === 'working-tree' ? activeDiffFiles : [],
    enabled: selection.type === 'working-tree',
  });
  const isWorkingTreeSelection = selection.type === 'working-tree';

  const getWorkingTreeHunkSelectionType = (path: string, hunkStartLineNumber: number) => {
    const file = activeDiffFiles.find((candidate) => candidate.displayPath === path);

    if (!file) {
      return 'none' as const;
    }

    const hunkSelection = workingTreeCommitSelection.selectionByPath[path];

    if (!hunkSelection || hunkSelection.kind !== 'lines') {
      return workingTreeCommitSelection.getFileSelectionType(path);
    }

    const selectableLines = getDiffChangeGroupSelectableLineNumbers(file, hunkStartLineNumber);
    const selectedCount = selectableLines.filter((lineNumber) =>
      hunkSelection.selection.isSelected(lineNumber),
    ).length;

    if (selectedCount === 0) {
      return 'none' as const;
    }

    if (selectedCount === selectableLines.length) {
      return 'all' as const;
    }

    return 'partial' as const;
  };

  const toggleWorkingTreeFileSelection = useCallback((path: string) => {
    workingTreeCommitSelection.toggleFileSelection(
      path,
      workingTreeCommitSelection.getFileSelectionType(path) === 'none',
    );
  }, [workingTreeCommitSelection]);
  const handleToggleRowSelection = useCallback((
    path: string,
    row: Parameters<typeof workingTreeCommitSelection.toggleRowSelection>[1],
    side: DiffSelectionSide = 'all',
  ) => {
    workingTreeCommitSelection.toggleRowSelection(
      path,
      row,
      workingTreeCommitSelection.getRowSelectionType(path, row, side) === 'none',
      side,
    );
  }, [workingTreeCommitSelection]);
  const handleToggleHunkSelection = useCallback((
    path: string,
    hunkStartLineNumber: number,
  ) => {
    workingTreeCommitSelection.toggleHunkSelection(
      path,
      hunkStartLineNumber,
      getWorkingTreeHunkSelectionType(path, hunkStartLineNumber) === 'none',
    );
  }, [getWorkingTreeHunkSelectionType, workingTreeCommitSelection]);

  const handleRestoreWorkingTree = useCallback(() => {
    setSelection({ type: 'working-tree' });
    setSelectedFilePath(null);
  }, []);

  const handleSelectHistoryCommit = useCallback((commit: PrCommit) => {
    setSelection({ type: 'commit', commit });
    setSelectedFilePath(null);
  }, []);

  const handleFileSelect = useCallback((path: string) => {
    setSelectedFilePath(path);
    onFileSelect?.();
  }, [onFileSelect]);

  const handleCommitSelection = useCallback((
    draft: { summary: string; description: string },
  ) => workingTreeCommitSelection.commitSelection(draft), [workingTreeCommitSelection]);
  const workingTreeCommitState = useMemo(
    () =>
      isWorkingTreeSelection
        ? {
            selectedFileCount: workingTreeCommitSelection.selectedFileCount,
            totalFileCount: workingTreeSidebarFiles.length,
            isSubmitting: workingTreeCommitSelection.isSubmitting,
            error: workingTreeCommitSelection.error,
            getFileSelectionType: workingTreeCommitSelection.getFileSelectionType,
            onToggleFileSelection: toggleWorkingTreeFileSelection,
            onCommit: handleCommitSelection,
          }
        : undefined,
    [
      handleCommitSelection,
      isWorkingTreeSelection,
      toggleWorkingTreeFileSelection,
      workingTreeSidebarFiles.length,
      workingTreeCommitSelection.error,
      workingTreeCommitSelection.getFileSelectionType,
      workingTreeCommitSelection.isSubmitting,
      workingTreeCommitSelection.selectedFileCount,
    ],
  );

  const sidebar = (
    <ChangesSidebar
      diffFiles={activeSidebarFiles}
      selectedPath={selectedFilePath}
      onSelectFile={handleFileSelect}
      selectedCommit={selectedCommit}
      isDiffLoading={activeDiffState.status === 'loading'}
      onRestoreBranchState={handleRestoreWorkingTree}
      emptyMessage={emptyMessage}
      workingTreeCommitState={workingTreeCommitState}
      historyCommits={historyCommits}
      historyIsLoading={historyIsLoading}
      historyIsRefreshing={historyIsRefreshing}
      historyError={historyError}
      historySelectedCommitSha={historySelectedCommitSha}
      workingTreeSortMode={workingTreeSortMode}
      onToggleWorkingTreeSortMode={onToggleWorkingTreeSortMode}
      onSelectHistoryCommit={(index) => {
        const commit = historyCommits[index];
        if (commit) {
          handleSelectHistoryCommit(commit);
        }
      }}
    />
  );

  const viewport = isViewportActive ? (
    <ActiveDiffViewport
      rawDiff={activeDiffState}
      renderContext={renderContext}
      selectedFilePath={selectedFilePath}
      emptyMessage={emptyMessage}
      isWorkingTreeSelection={isWorkingTreeSelection}
      getRowSelectionType={workingTreeCommitSelection.getRowSelectionType}
      getHunkSelectionType={getWorkingTreeHunkSelectionType}
      onToggleRowSelection={handleToggleRowSelection}
      onToggleHunkSelection={handleToggleHunkSelection}
      onSubmitComment={onSubmitDiffComment}
    />
  ) : null;

  return <>{children({ sidebar, viewport })}</>;
}
