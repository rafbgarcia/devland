import { useEffect, useMemo, useState } from 'react';

import type { GitStatusFile, PrCommit } from '@/ipc/contracts';
import { CodeChangesFilesViewport } from '@/renderer/components/code-changes-files-viewport';
import { CodeChangesHistoryDrawer } from '@/renderer/components/code-changes-history-drawer';
import { CodeChangesSidebar } from '@/renderer/components/code-changes-sidebar';
import {
  useGitCommitDiff,
  useGitHistoryMeta,
  useGitWorkingTreeDiff,
} from '@/renderer/hooks/use-git-code-changes';

type CodeChangesSelection =
  | { type: 'working-tree' }
  | { type: 'commit'; commit: PrCommit };

export function CodeChanges({
  repoPath,
  baseBranchName,
  branchName,
  workingTreeFiles,
}: {
  repoPath: string;
  baseBranchName: string;
  branchName: string;
  workingTreeFiles: GitStatusFile[];
}) {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selection, setSelection] = useState<CodeChangesSelection>({ type: 'working-tree' });
  const { metaState: historyMetaState, refetch: refetchHistoryMeta } = useGitHistoryMeta({
    repoPath,
    baseBranch: baseBranchName,
    headBranch: branchName,
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
  const activeDiffFiles = selection.type === 'working-tree'
    ? workingTreeState.diffFiles
    : commitDiffState.diffFiles;
  const emptyMessage = selection.type === 'working-tree'
    ? 'Working tree is clean.'
    : 'No file changes in this commit.';
  const historyCommits = historyMetaState.status === 'ready'
    ? historyMetaState.data.commits
    : [];
  const selectedCommit = selection.type === 'commit' ? selection.commit : null;
  const historySelectedCommitSha = selectedCommit?.sha ?? null;
  const historyIsLoading = historyMetaState.status === 'loading';
  const historyError = historyMetaState.status === 'error'
    ? historyMetaState.error
    : null;

  const handleRestoreWorkingTree = () => {
    setSelection({ type: 'working-tree' });
  };

  const handleSelectHistoryCommit = (commit: PrCommit) => {
    setSelection({ type: 'commit', commit });
    setIsHistoryOpen(false);
  };

  const drawerCommits = useMemo(() => historyCommits, [historyCommits]);

  return (
    <div className="relative flex h-full min-h-0">
      <CodeChangesFilesViewport
        rawDiff={activeDiffState}
        diffFiles={activeDiffFiles}
        emptyMessage={emptyMessage}
        sidebar={({ diffFiles: sidebarDiffFiles, visibleFiles, onSelectFile }) => (
          <CodeChangesSidebar
            diffFiles={sidebarDiffFiles}
            visibleFiles={visibleFiles}
            onSelectFile={onSelectFile}
            selectedCommit={selectedCommit}
            isDiffLoading={activeDiffState.status === 'loading'}
            onOpenHistory={() => {
              void refetchHistoryMeta();
              setIsHistoryOpen(true);
            }}
            onRestoreBranchState={handleRestoreWorkingTree}
            emptyMessage={emptyMessage}
          />
        )}
      />

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
    </div>
  );
}
