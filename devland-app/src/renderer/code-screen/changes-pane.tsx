import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  parsePatchDocument,
  type DiffCommentAnchor,
  type DiffFile,
} from '@devlandapp/diff-viewer';
import { DiffFileView } from '@devlandapp/diff-viewer/react';

import { CircleCheckIcon } from 'lucide-react';
import { motion } from 'motion/react';

import type {
  ExternalEditorPreference,
  GitStatusFile,
  PrCommit,
} from '@/ipc/contracts';
import type { CodexComposerSettings } from '@/lib/codex-chat';
import { ChangesSidebar } from '@/renderer/code-screen/changes-sidebar';
import {
  useGitBranchHistory,
  useGitCommitDiff,
  useGitWorkingTreeDiff,
} from '@/renderer/code-screen/use-git-code-changes';
import { useWorkingTreeCommitSelection } from '@/renderer/code-screen/use-working-tree-commit-selection';
import type { CodexSessionState } from '@/renderer/code-screen/codex-session-state';
import { openRepoFileInExternalEditor } from '@/renderer/shared/lib/open-file-in-external-editor';

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
  selectedFilePath,
  emptyMessage,
  onSubmitComment,
}: {
  rawDiff: ReturnType<typeof useGitWorkingTreeDiff>['rawDiff'] | ReturnType<typeof useGitCommitDiff>['rawDiff'];
  selectedFilePath: string | null;
  emptyMessage: ReactNode;
  onSubmitComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
}) {
  const parsedDiff = useMemo(
    () => rawDiff.status === 'ready' ? parsePatchDocument(rawDiff.data) : null,
    [rawDiff],
  );
  const selectedFile = useMemo(
    () =>
      selectedFilePath === null
        ? null
        : (parsedDiff?.files.find((file) => file.displayPath === selectedFilePath) ?? null),
    [parsedDiff, selectedFilePath],
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {rawDiff.status === 'error' ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-destructive">{rawDiff.error}</p>
        </div>
      ) : null}

      {rawDiff.status === 'ready' && selectedFile === null ? (
        <div className="flex flex-1 items-center justify-center">
          {emptyMessage}
        </div>
      ) : null}

      {rawDiff.status === 'ready' && selectedFile !== null ? (
        <div className="flex-1 overflow-auto">
          <div className="min-h-full p-3">
            <DiffFileView
              file={selectedFile}
              onSubmitComment={onSubmitComment}
            />
          </div>
        </div>
      ) : null}
    </div>
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
  codexSessionState: Pick<
    CodexSessionState,
    'status' | 'threadId' | 'transcriptEntries'
  > & Pick<CodexComposerSettings, 'model' | 'reasoningEffort'>;
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

  const activeDiffFiles = useMemo(
    () => (activeDiffState.status === 'ready' ? parsePatchDocument(activeDiffState.data).files : []),
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

  const toggleWorkingTreeFileSelection = useCallback((path: string) => {
    workingTreeCommitSelection.toggleFileSelection(
      path,
      !workingTreeCommitSelection.isFileSelected(path),
    );
  }, [workingTreeCommitSelection]);

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
            isFileSelected: workingTreeCommitSelection.isFileSelected,
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
      workingTreeCommitSelection.isFileSelected,
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
      selectedFilePath={selectedFilePath}
      emptyMessage={viewportEmptyMessage}
      onSubmitComment={onSubmitDiffComment}
    />
  ) : null;

  return <>{children({ sidebar, viewport })}</>;
}
