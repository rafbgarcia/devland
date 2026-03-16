import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { GitStatusFile, PrCommit } from '@/ipc/contracts';
import type { DiffCommentAnchor } from '@/lib/diff';
import {
  CodeChangesFilesViewport,
  type CodeChangesViewportHandle,
} from '@/renderer/components/code-changes-files-viewport';
import { DiffDisplayModeToolbar } from '@/renderer/components/diff-display-mode-toolbar';
import { CodeChangesHistoryDrawer } from '@/renderer/components/code-changes-history-drawer';
import { CodeChangesSidebar } from '@/renderer/components/code-changes-sidebar';
import {
  useGitBranchHistory,
  useGitCommitDiff,
  useGitWorkingTreeDiff,
} from '@/renderer/hooks/use-git-code-changes';
import { useDiffRenderFiles } from '@/renderer/hooks/use-diff-render-files';
import { useUserPreferences } from '@/renderer/hooks/use-user-preferences';
import { useWorkingTreeCommitSelection } from '@/renderer/hooks/use-working-tree-commit-selection';

type CodeChangesSelection =
  | { type: 'working-tree' }
  | { type: 'commit'; commit: PrCommit };

type CodeChangesRenderProps = {
  sidebar: ReactNode;
  viewport: ReactNode;
  historyDrawer: ReactNode;
};

function areVisibleFileSetsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

export function CodeChanges({
  repoPath,
  baseBranchName,
  branchName,
  headRevision,
  workingTreeFiles,
  children,
  onFileSelect,
  onSubmitDiffComment,
}: {
  repoPath: string;
  baseBranchName: string;
  branchName: string;
  headRevision: string | null;
  workingTreeFiles: GitStatusFile[];
  children: (props: CodeChangesRenderProps) => ReactNode;
  onFileSelect?: () => void;
  onSubmitDiffComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
}) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selection, setSelection] = useState<CodeChangesSelection>({ type: 'working-tree' });
  const [visibleFiles, setVisibleFiles] = useState<Set<string>>(new Set());
  const viewportRef = useRef<CodeChangesViewportHandle>(null);
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
  const activeRenderFiles = useDiffRenderFiles({
    rawDiff: activeDiffState,
    context: renderContext,
    displayMode: preferences.diffDisplayMode,
  });
  const workingTreeCommitSelection = useWorkingTreeCommitSelection({
    repoPath,
    diffFiles: selection.type === 'working-tree' ? activeRenderFiles : [],
    enabled: selection.type === 'working-tree',
  });
  const isWorkingTreeSelection = selection.type === 'working-tree';

  const getWorkingTreeHunkSelectionType = (path: string, hunkStartLineNumber: number) => {
    const file = activeRenderFiles.find((candidate) => candidate.path === path);

    if (!file) {
      return 'none' as const;
    }

    const hunk = file.diff.hunks.find(
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

  const toggleWorkingTreeFileSelection = (path: string) => {
    workingTreeCommitSelection.toggleFileSelection(
      path,
      workingTreeCommitSelection.getFileSelectionType(path) === 'none',
    );
  };

  const handleRestoreWorkingTree = () => {
    setSelection({ type: 'working-tree' });
  };

  const handleSelectHistoryCommit = (commit: PrCommit) => {
    setSelection({ type: 'commit', commit });
    setIsHistoryOpen(false);
  };

  const handleFileSelect = (path: string) => {
    viewportRef.current?.scrollToFile(path);
    onFileSelect?.();
  };
  const handleVisibleFilesChange = useCallback((nextVisibleFiles: Set<string>) => {
    setVisibleFiles((currentVisibleFiles) =>
      areVisibleFileSetsEqual(currentVisibleFiles, nextVisibleFiles)
        ? currentVisibleFiles
        : nextVisibleFiles,
    );
  }, []);

  const drawerCommits = useMemo(() => historyCommits, [historyCommits]);

  const sidebar = (
    <CodeChangesSidebar
      diffFiles={activeRenderFiles}
      visibleFiles={visibleFiles}
      onSelectFile={handleFileSelect}
      selectedCommit={selectedCommit}
      isDiffLoading={activeDiffState.status === 'loading'}
      onOpenHistory={() => {
        setIsHistoryOpen(true);
      }}
      onRestoreBranchState={handleRestoreWorkingTree}
      emptyMessage={emptyMessage}
      workingTreeCommitState={
        isWorkingTreeSelection
          ? {
              selectedFileCount: workingTreeCommitSelection.selectedFileCount,
              totalFileCount: activeRenderFiles.length,
              summary: workingTreeCommitSelection.draft.summary,
              description: workingTreeCommitSelection.draft.description,
              isSubmitting: workingTreeCommitSelection.isSubmitting,
              error: workingTreeCommitSelection.error,
              getFileSelectionType: workingTreeCommitSelection.getFileSelectionType,
              onToggleFileSelection: toggleWorkingTreeFileSelection,
              onSummaryChange: workingTreeCommitSelection.setDraftSummary,
              onDescriptionChange: workingTreeCommitSelection.setDraftDescription,
              onCommit: () => {
                void workingTreeCommitSelection.commitSelection();
              },
            }
          : undefined
      }
    />
  );

  const viewport = (
    <CodeChangesFilesViewport
      ref={viewportRef}
      rawDiff={activeDiffState}
      diffFiles={activeRenderFiles}
      displayMode={preferences.diffDisplayMode}
      mainTop={<DiffDisplayModeToolbar />}
      emptyMessage={emptyMessage}
      onVisibleFilesChange={handleVisibleFilesChange}
      getFileSelectionType={
        isWorkingTreeSelection
          ? workingTreeCommitSelection.getFileSelectionType
          : undefined
      }
      getRowSelectionType={
        isWorkingTreeSelection
          ? workingTreeCommitSelection.getRowSelectionType
          : undefined
      }
      getHunkSelectionType={
        isWorkingTreeSelection
          ? getWorkingTreeHunkSelectionType
          : undefined
      }
      onToggleFileSelection={
        isWorkingTreeSelection
          ? toggleWorkingTreeFileSelection
          : undefined
      }
      onToggleRowSelection={
        isWorkingTreeSelection
          ? (path, row) =>
              workingTreeCommitSelection.toggleRowSelection(
                path,
                row,
                workingTreeCommitSelection.getRowSelectionType(path, row) === 'none',
              )
          : undefined
      }
      onToggleHunkSelection={
        isWorkingTreeSelection
          ? (path, hunkStartLineNumber) =>
              workingTreeCommitSelection.toggleHunkSelection(
                path,
                hunkStartLineNumber,
                getWorkingTreeHunkSelectionType(path, hunkStartLineNumber) === 'none',
              )
          : undefined
      }
      onSubmitComment={onSubmitDiffComment}
    />
  );

  const historyDrawer = (
    <CodeChangesHistoryDrawer
      open={isHistoryOpen}
      commits={drawerCommits}
      isLoading={historyIsLoading}
      isRefreshing={historyIsRefreshing}
      error={historyError}
      selectedCommitSha={historySelectedCommitSha}
      onClose={() => setIsHistoryOpen(false)}
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
