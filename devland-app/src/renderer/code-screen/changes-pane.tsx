import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { CircleCheckIcon } from 'lucide-react';
import { motion } from 'motion/react';

import type {
  ExternalEditorPreference,
  GitStatusFile,
  PrCommit,
} from '@/ipc/contracts';
import {
  getDiffChangeGroupSelectableLineNumbers,
  type DiffCommentAnchor,
  type DiffSelectionSide,
} from '@/lib/diff';
import { ChangesSidebar } from '@/renderer/code-screen/changes-sidebar';
import {
  useGitBranchHistory,
  useGitCommitDiff,
  useGitWorkingTreeDiff,
} from '@/renderer/code-screen/use-git-code-changes';
import { useWorkingTreeCommitSelection } from '@/renderer/code-screen/use-working-tree-commit-selection';
import type { CodexSessionState } from '@/renderer/code-screen/codex-session-state';
import { getParsedDiffFiles } from '@/renderer/shared/ui/diff/parsed-diff-files';
import { SingleFileDiffView } from '@/renderer/shared/ui/diff/single-file-diff-view';
import { getExpandedDiffHighlightLineFilters } from '@/renderer/shared/ui/diff/diff-expansion';
import { useDiffExpansionState } from '@/renderer/shared/ui/diff/use-diff-expansion-state';
import { useDiffRenderFiles } from '@/renderer/shared/ui/diff/use-diff-render-files';
import { openRepoFileInExternalEditor } from '@/renderer/shared/lib/open-file-in-external-editor';

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
) {
  return [...files]
    .sort((left, right) => left.path.localeCompare(right.path))
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
  emptyMessage: ReactNode;
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
  codexSessionState,
  workingTreeFiles,
  workingTreeStatusRefreshVersion,
  isViewportActive,
  children,
  onFileSelect,
  onSubmitDiffComment,
  externalEditorPreference,
  onExternalEditorPreferenceChange,
  onRequestConfigureExternalEditor,
}: {
  repoPath: string;
  baseBranchName: string;
  branchName: string;
  headRevision: string | null;
  codexSessionState: Pick<CodexSessionState, 'status' | 'threadId' | 'transcriptEntries'>;
  workingTreeFiles: GitStatusFile[];
  workingTreeStatusRefreshVersion: number;
  isViewportActive: boolean;
  children: (props: CodeChangesRenderProps) => ReactNode;
  onFileSelect?: () => void;
  onSubmitDiffComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
  externalEditorPreference: ExternalEditorPreference | null;
  onExternalEditorPreferenceChange?: (preference: ExternalEditorPreference) => void;
  onRequestConfigureExternalEditor?: () => void;
}) {
  const [selection, setSelection] = useState<CodeChangesSelection>({ type: 'working-tree' });
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [openFileError, setOpenFileError] = useState<string | null>(null);

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
    setOpenFileError(null);
  }, [baseBranchName, branchName, repoPath]);

  const activeDiffState = selection.type === 'working-tree'
    ? workingTreeState.rawDiff
    : commitDiffState.rawDiff;
  const sidebarEmptyMessage = selection.type === 'working-tree'
    ? (activeDiffState.status === 'loading' ? null : (
        <div className="flex flex-col items-center gap-1.5 text-center">
          <CircleCheckIcon className="size-5 text-emerald-500/30" />
          <div>
            <p className="text-xs font-medium text-muted-foreground/60">No changes</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/35">Modified files will appear here</p>
          </div>
        </div>
      ))
    : (activeDiffState.status === 'loading' ? null : (
        <p className="text-xs text-muted-foreground/50">No file changes in this commit.</p>
      ));
  const viewportEmptyMessage = selection.type === 'working-tree'
    ? (activeDiffState.status === 'loading' ? null : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="text-center"
        >
          <CircleCheckIcon className="mx-auto mb-3 size-10 text-emerald-500/20" />
          <p className="text-sm font-medium text-foreground/50">Working tree is clean</p>
          <p className="mt-1.5 text-xs text-muted-foreground/40">
            File changes will appear here as you work
          </p>
        </motion.div>
      ))
    : (activeDiffState.status === 'loading' ? null : (
        <p className="text-sm text-muted-foreground">No file changes in this commit.</p>
      ));
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
    () => toWorkingTreeSidebarFiles(workingTreeFiles),
    [workingTreeFiles],
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
    branchName,
    diffFiles: selection.type === 'working-tree' ? activeDiffFiles : [],
    enabled: selection.type === 'working-tree',
    codexContext: codexSessionState,
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
    setOpenFileError(null);
  }, []);

  const handleSelectHistoryCommit = useCallback((commit: PrCommit) => {
    setSelection({ type: 'commit', commit });
    setSelectedFilePath(null);
    setOpenFileError(null);
  }, []);

  const handleFileSelect = useCallback((path: string) => {
    setSelectedFilePath(path);
    setOpenFileError(null);
    onFileSelect?.();
  }, [onFileSelect]);

  const handleOpenFile = useCallback(async (path: string) => {
    try {
      await openRepoFileInExternalEditor({
        repoPath,
        relativeFilePath: path,
        externalEditorPreference,
        onExternalEditorPreferenceChange,
        onRequestConfigureExternalEditor,
      });
      setOpenFileError(null);
    } catch (error) {
      setOpenFileError(
        error instanceof Error ? error.message : 'Could not open that file.',
      );
    }
  }, [
    externalEditorPreference,
    onExternalEditorPreferenceChange,
    onRequestConfigureExternalEditor,
    repoPath,
  ]);

  const handleCommitSelection = useCallback((
    draft: { summary: string; description: string; includeCodexContext: boolean },
  ) => workingTreeCommitSelection.commitSelection(draft), [workingTreeCommitSelection]);
  const workingTreeCommitState = useMemo(
    () =>
      isWorkingTreeSelection
        ? {
            selectedFileCount: workingTreeCommitSelection.selectedFileCount,
            totalFileCount: workingTreeSidebarFiles.length,
            isSubmitting: workingTreeCommitSelection.isSubmitting,
            error: workingTreeCommitSelection.error,
            codexContext: {
              enabled:
                codexSessionState.threadId !== null &&
                codexSessionState.status !== 'running',
              reason:
                codexSessionState.threadId === null
                  ? 'Start a Codex session on this code target to attach context.'
                  : codexSessionState.status === 'running'
                    ? 'Wait for the active Codex turn to finish before attaching context.'
                    : null,
            },
            getFileSelectionType: workingTreeCommitSelection.getFileSelectionType,
            onToggleFileSelection: toggleWorkingTreeFileSelection,
            onCommit: handleCommitSelection,
          }
        : undefined,
    [
      handleCommitSelection,
      isWorkingTreeSelection,
      codexSessionState.status,
      codexSessionState.threadId,
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
      onRestoreBranchState={handleRestoreWorkingTree}
      emptyMessage={sidebarEmptyMessage}
      workingTreeCommitState={workingTreeCommitState}
      historyCommits={historyCommits}
      historyIsLoading={historyIsLoading}
      historyIsRefreshing={historyIsRefreshing}
      historyError={historyError}
      historySelectedCommitSha={historySelectedCommitSha}
      onSelectHistoryCommit={(index) => {
        const commit = historyCommits[index];
        if (commit) {
          handleSelectHistoryCommit(commit);
        }
      }}
      onOpenFile={(path) => void handleOpenFile(path)}
      openFileError={openFileError}
    />
  );

  const viewport = isViewportActive ? (
    <ActiveDiffViewport
      rawDiff={activeDiffState}
      renderContext={renderContext}
      selectedFilePath={selectedFilePath}
      emptyMessage={viewportEmptyMessage}
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
