import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { GitStatusFile, PrCommit } from '@/ipc/contracts';
import {
  CodeChangesFilesViewport,
  type CodeChangesViewportHandle,
} from '@/renderer/components/code-changes-files-viewport';
import { CodeChangesHistoryDrawer } from '@/renderer/components/code-changes-history-drawer';
import { CodeChangesSidebar } from '@/renderer/components/code-changes-sidebar';
import {
  useGitBranchHistory,
  useGitCommitDiff,
  useGitWorkingTreeDiff,
} from '@/renderer/hooks/use-git-code-changes';
import { useDiffRenderFiles } from '@/renderer/hooks/use-diff-render-files';

type CodeChangesSelection =
  | { type: 'working-tree' }
  | { type: 'commit'; commit: PrCommit };

type CodeChangesRenderProps = {
  sidebar: ReactNode;
  viewport: ReactNode;
  historyDrawer: ReactNode;
};

export function CodeChanges({
  repoPath,
  baseBranchName,
  branchName,
  workingTreeFiles,
  gitStateVersion = 0,
  children,
  onFileSelect,
}: {
  repoPath: string;
  baseBranchName: string;
  branchName: string;
  workingTreeFiles: GitStatusFile[];
  gitStateVersion?: number;
  children: (props: CodeChangesRenderProps) => ReactNode;
  onFileSelect?: () => void;
}) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selection, setSelection] = useState<CodeChangesSelection>({ type: 'working-tree' });
  const [visibleFiles, setVisibleFiles] = useState<Set<string>>(new Set());
  const viewportRef = useRef<CodeChangesViewportHandle>(null);

  const { historyState, refetch: refetchHistory } = useGitBranchHistory({
    repoPath,
    branchName,
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

  useEffect(() => {
    if (gitStateVersion === 0 || !isHistoryOpen) {
      return;
    }

    void refetchHistory();
  }, [gitStateVersion, isHistoryOpen, refetchHistory]);

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
  const historyIsLoading = historyState.status === 'loading';
  const historyError = historyState.status === 'error'
    ? historyState.error
    : null;
  const activeRenderFiles = useDiffRenderFiles({
    rawDiff: activeDiffState,
    context:
      selection.type === 'working-tree'
        ? { kind: 'working-tree', repoPath }
        : selectedCommit === null
        ? null
        : {
            kind: 'commit',
            repoPath,
            commitRevision: selectedCommit.sha,
            parentRevision: commitDiffState.parentRevision,
          },
  });

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

  const drawerCommits = useMemo(() => historyCommits, [historyCommits]);

  const sidebar = (
    <CodeChangesSidebar
      diffFiles={activeRenderFiles}
      visibleFiles={visibleFiles}
      onSelectFile={handleFileSelect}
      selectedCommit={selectedCommit}
      isDiffLoading={activeDiffState.status === 'loading'}
      onOpenHistory={() => {
        void refetchHistory();
        setIsHistoryOpen(true);
      }}
      onRestoreBranchState={handleRestoreWorkingTree}
      emptyMessage={emptyMessage}
    />
  );

  const viewport = (
    <CodeChangesFilesViewport
      ref={viewportRef}
      rawDiff={activeDiffState}
      diffFiles={activeRenderFiles}
      emptyMessage={emptyMessage}
      onVisibleFilesChange={setVisibleFiles}
    />
  );

  const historyDrawer = (
    <CodeChangesHistoryDrawer
      open={isHistoryOpen}
      commits={drawerCommits}
      isLoading={historyIsLoading}
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
