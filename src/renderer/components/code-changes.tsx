import { LayersIcon } from 'lucide-react';

import { CodeChangesCommitsList } from '@/renderer/components/code-changes-commits-list';
import { CodeChangesFilesViewport } from '@/renderer/components/code-changes-files-viewport';
import { useGitBranchCompareData } from '@/renderer/hooks/use-git-branch-compare-data';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import { Spinner } from '@/shadcn/components/ui/spinner';

export function CodeChanges({
  repoPath,
  baseBranchName,
  branchName,
}: {
  repoPath: string;
  baseBranchName: string;
  branchName: string;
}) {
  const {
    metaState,
    selection,
    rawDiff,
    diffFiles,
    handleSelectCommit,
    handleSelectAll,
  } = useGitBranchCompareData({
    repoPath,
    baseBranch: baseBranchName,
    headBranch: branchName,
  });

  if (metaState.status === 'loading') {
    return (
      <Empty className="h-full rounded-none border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner className="size-4" />
          </EmptyMedia>
          <EmptyTitle>Loading branch comparison</EmptyTitle>
          <EmptyDescription>
            Comparing {baseBranchName} with {branchName}.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (metaState.status === 'error') {
    return (
      <Empty className="h-full rounded-none border-0">
        <EmptyHeader>
          <EmptyTitle>Could not load branch comparison</EmptyTitle>
          <EmptyDescription>{metaState.error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (metaState.status !== 'ready' || rawDiff.status === 'idle') {
    return null;
  }

  if (diffFiles.length === 0) {
    return (
      <Empty className="h-full rounded-none border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LayersIcon className="size-4" />
          </EmptyMedia>
          <EmptyTitle>No branch differences</EmptyTitle>
          <EmptyDescription>
            {branchName} is up to date with {baseBranchName}.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <CodeChangesFilesViewport
      rawDiff={rawDiff}
      diffFiles={diffFiles}
      emptyMessage={`No file changes between ${baseBranchName} and ${branchName}.`}
      sidebarTop={(
        <CodeChangesCommitsList
          commits={metaState.data.commits}
          selection={selection}
          onSelectCommit={handleSelectCommit}
          onSelectAll={handleSelectAll}
        />
      )}
    />
  );
}
