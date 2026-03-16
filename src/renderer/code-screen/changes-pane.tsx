import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { GitStatusFile, PrCommit } from '@/ipc/contracts';
import { parseUnifiedDiffDocument, type DiffCommentAnchor } from '@/lib/diff';
import { ChangesSidebar } from '@/renderer/code-screen/changes-sidebar';
import { CodeChangesHistoryDrawer } from '@/renderer/code-screen/changes-history-drawer';
import { SelectedFileDiffView } from '@/renderer/code-screen/selected-file-diff-view';
import {
  useGitBranchHistory,
  useGitCommitDiff,
  useGitWorkingTreeDiff,
} from '@/renderer/code-screen/use-git-code-changes';
import { useWorkingTreeCommitSelection } from '@/renderer/code-screen/use-working-tree-commit-selection';
import { useDiffRenderFiles } from '@/renderer/shared/ui/diff/use-diff-render-files';
import { useUserPreferences } from '@/renderer/shared/hooks/use-user-preferences';

type CodeChangesSelection =
  | { type: 'working-tree' }
  | { type: 'commit'; commit: PrCommit };

type CodeChangesRenderProps = {
  sidebar: ReactNode;
  viewport: ReactNode;
  historyDrawer: ReactNode;
};

function ActiveDiffViewport({
  rawDiff,
  renderContext,
  displayMode,
  selectedFilePath,
  emptyMessage,
  isWorkingTreeSelection,
  getFileSelectionType,
  getRowSelectionType,
  getHunkSelectionType,
  onToggleFileSelection,
  onToggleRowSelection,
  onToggleHunkSelection,
  onSubmitComment,
}: {
  rawDiff: ReturnType<typeof useGitWorkingTreeDiff>['rawDiff'] | ReturnType<typeof useGitCommitDiff>['rawDiff'];
  renderContext:
    | { kind: 'working-tree'; repoPath: string }
    | { kind: 'commit'; repoPath: string; commitRevision: string; parentRevision: string | null }
    | null;
  displayMode: ReturnType<typeof useUserPreferences>['preferences']['diffDisplayMode'];
  selectedFilePath: string | null;
  emptyMessage: string;
  isWorkingTreeSelection: boolean;
  getFileSelectionType: ReturnType<typeof useWorkingTreeCommitSelection>['getFileSelectionType'];
  getRowSelectionType: ReturnType<typeof useWorkingTreeCommitSelection>['getRowSelectionType'];
  getHunkSelectionType: (path: string, hunkStartLineNumber: number) => 'none' | 'all' | 'partial';
  onToggleFileSelection: (path: string) => void;
  onToggleRowSelection: (
    path: string,
    row: Parameters<ReturnType<typeof useWorkingTreeCommitSelection>['toggleRowSelection']>[1],
  ) => void;
  onToggleHunkSelection: (path: string, hunkStartLineNumber: number) => void;
  onSubmitComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
}) {
  const highlightPaths = useMemo(
    () => selectedFilePath === null ? [] : [selectedFilePath],
    [selectedFilePath],
  );
  const renderFiles = useDiffRenderFiles({
    rawDiff,
    context: renderContext,
    displayMode,
    highlightPaths,
  });
  const selectedFile = useMemo(
    () =>
      selectedFilePath === null
        ? null
        : (renderFiles.find((file) => file.path === selectedFilePath) ?? null),
    [renderFiles, selectedFilePath],
  );

  return (
    <SelectedFileDiffView
      rawDiff={rawDiff}
      selectedFile={selectedFile}
      displayMode={displayMode}
      emptyMessage={emptyMessage}
      getFileSelectionType={isWorkingTreeSelection ? getFileSelectionType : undefined}
      getRowSelectionType={isWorkingTreeSelection ? getRowSelectionType : undefined}
      getHunkSelectionType={isWorkingTreeSelection ? getHunkSelectionType : undefined}
      onToggleFileSelection={isWorkingTreeSelection ? onToggleFileSelection : undefined}
      onToggleRowSelection={isWorkingTreeSelection ? onToggleRowSelection : undefined}
      onToggleHunkSelection={isWorkingTreeSelection ? onToggleHunkSelection : undefined}
      onSubmitComment={onSubmitComment}
    />
  );
}

export function ChangesPane({
  repoPath,
  baseBranchName,
  branchName,
  headRevision,
  workingTreeFiles,
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
  isViewportActive: boolean;
  children: (props: CodeChangesRenderProps) => ReactNode;
  onFileSelect?: () => void;
  onSubmitDiffComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
}) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selection, setSelection] = useState<CodeChangesSelection>({ type: 'working-tree' });
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const { preferences } = useUserPreferences();

  const { historyState } = useGitBranchHistory({
    repoPath,
    branchName,
    headRevision,
  });
  const workingTreeState = useGitWorkingTreeDiff({
    repoPath,
    files: workingTreeFiles,
  });
  const commitDiffState = useGitCommitDiff({
    repoPath,
    commitSha: selection.type === 'commit' ? selection.commit.sha : null,
  });

  useEffect(() => {
    setIsHistoryOpen(false);
    setSelection({ type: 'working-tree' });
    setSelectedFilePath(null);
  }, [baseBranchName, branchName, repoPath]);

  const activeDiffState = selection.type === 'working-tree'
    ? workingTreeState.rawDiff
    : commitDiffState.rawDiff;
  const emptyMessage = selection.type === 'working-tree'
    ? 'Working tree is clean.'
    : 'No file changes in this commit.';
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
    () => (activeDiffState.status === 'ready' ? parseUnifiedDiffDocument(activeDiffState.data).files : []),
    [activeDiffState],
  );

  useEffect(() => {
    if (activeDiffFiles.length === 0) {
      if (selectedFilePath !== null) {
        setSelectedFilePath(null);
      }
      return;
    }

    if (
      selectedFilePath !== null &&
      activeDiffFiles.some((file) => file.displayPath === selectedFilePath)
    ) {
      return;
    }

    setSelectedFilePath(activeDiffFiles[0]?.displayPath ?? null);
  }, [activeDiffFiles, selectedFilePath]);

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

    const hunk = file.hunks.find(
      (candidate) => candidate.originalStartLineNumber === hunkStartLineNumber,
    );
    const hunkSelection = workingTreeCommitSelection.selectionByPath[path];

    if (!hunk || !hunkSelection || hunkSelection.kind !== 'lines') {
      return workingTreeCommitSelection.getFileSelectionType(path);
    }

    const selectableLines = hunk.lines
      .filter((line) => line.isSelectable)
      .map((line) => line.originalDiffLineNumber);
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
  const handleOpenHistory = useCallback(() => {
    setIsHistoryOpen(true);
  }, []);
  const handleCloseHistory = useCallback(() => {
    setIsHistoryOpen(false);
  }, []);
  const handleToggleRowSelection = useCallback((
    path: string,
    row: Parameters<typeof workingTreeCommitSelection.toggleRowSelection>[1],
  ) => {
    workingTreeCommitSelection.toggleRowSelection(
      path,
      row,
      workingTreeCommitSelection.getRowSelectionType(path, row) === 'none',
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
    setIsHistoryOpen(false);
    setSelectedFilePath(null);
  }, []);

  const handleFileSelect = useCallback((path: string) => {
    setSelectedFilePath(path);
    onFileSelect?.();
  }, [onFileSelect]);

  const drawerCommits = useMemo(() => historyCommits, [historyCommits]);

  const handleCommitSelection = useCallback((
    draft: { summary: string; description: string },
  ) => workingTreeCommitSelection.commitSelection(draft), [workingTreeCommitSelection]);
  const workingTreeCommitState = useMemo(
    () =>
      isWorkingTreeSelection
        ? {
            selectedFileCount: workingTreeCommitSelection.selectedFileCount,
            totalFileCount: activeDiffFiles.length,
            isSubmitting: workingTreeCommitSelection.isSubmitting,
            error: workingTreeCommitSelection.error,
            getFileSelectionType: workingTreeCommitSelection.getFileSelectionType,
            onToggleFileSelection: toggleWorkingTreeFileSelection,
            onCommit: handleCommitSelection,
          }
        : undefined,
    [
      activeDiffFiles.length,
      handleCommitSelection,
      isWorkingTreeSelection,
      toggleWorkingTreeFileSelection,
      workingTreeCommitSelection.error,
      workingTreeCommitSelection.getFileSelectionType,
      workingTreeCommitSelection.isSubmitting,
      workingTreeCommitSelection.selectedFileCount,
    ],
  );

  const sidebar = (
    <ChangesSidebar
      diffFiles={activeDiffFiles.map((file) => ({
        path: file.displayPath,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
      }))}
      selectedPath={selectedFilePath}
      onSelectFile={handleFileSelect}
      selectedCommit={selectedCommit}
      isDiffLoading={activeDiffState.status === 'loading'}
      onOpenHistory={handleOpenHistory}
      onRestoreBranchState={handleRestoreWorkingTree}
      emptyMessage={emptyMessage}
      workingTreeCommitState={workingTreeCommitState}
    />
  );

  const viewport = isViewportActive ? (
    <ActiveDiffViewport
      rawDiff={activeDiffState}
      renderContext={renderContext}
      displayMode={preferences.diffDisplayMode}
      selectedFilePath={selectedFilePath}
      emptyMessage={emptyMessage}
      isWorkingTreeSelection={isWorkingTreeSelection}
      getFileSelectionType={workingTreeCommitSelection.getFileSelectionType}
      getRowSelectionType={workingTreeCommitSelection.getRowSelectionType}
      getHunkSelectionType={getWorkingTreeHunkSelectionType}
      onToggleFileSelection={toggleWorkingTreeFileSelection}
      onToggleRowSelection={handleToggleRowSelection}
      onToggleHunkSelection={handleToggleHunkSelection}
      onSubmitComment={onSubmitDiffComment}
    />
  ) : null;

  const historyDrawer = (
    <CodeChangesHistoryDrawer
      open={isHistoryOpen}
      commits={drawerCommits}
      isLoading={historyIsLoading}
      isRefreshing={historyIsRefreshing}
      error={historyError}
      selectedCommitSha={historySelectedCommitSha}
      onClose={handleCloseHistory}
      onSelectCommit={(index) => {
        const commit = drawerCommits[index];

        if (!commit) {
          return;
        }

        handleSelectHistoryCommit(commit);
      }}
    />
  );

  return <>{children({ sidebar, viewport, historyDrawer })}</>;
}
