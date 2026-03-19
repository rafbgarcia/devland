import { memo, useMemo } from 'react';

import {
  GitCommitHorizontalIcon,
  Undo2Icon,
} from 'lucide-react';

import type { PrCommit } from '@/ipc/contracts';
import type { DiffSelectionType } from '@/lib/diff';
import {
  FilesChangedList,
  type DiffListFile,
} from '@/renderer/shared/ui/diff/files-changed-list';
import { ChangesHistoryDropdown } from '@/renderer/code-screen/changes-history-dropdown';
import { CommitComposer } from '@/renderer/code-screen/commit-composer';
import { RelativeTime } from '@/renderer/shared/ui/relative-time';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/shadcn/components/ui/alert';
import { Button } from '@/shadcn/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shadcn/components/ui/tooltip';

function HistorySnapshotBanner({
  commit,
  onRestoreBranchState,
}: {
  commit: PrCommit;
  onRestoreBranchState: () => void;
}) {
  return (
    <div className="border-b border-border px-3 pb-3">
      <Alert>
        <GitCommitHorizontalIcon />
        <AlertAction>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                type="button"
                variant="ghost"
                aria-label="Back to current branch state"
                onClick={onRestoreBranchState}
              >
                <Undo2Icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to current branch state</TooltipContent>
          </Tooltip>
        </AlertAction>
        <AlertTitle>History snapshot</AlertTitle>
        <AlertDescription className="pr-10">
          <div className="mt-0.5 text-sm font-medium text-foreground">
            {commit.title || commit.shortSha}
          </div>
          {commit.body ? (
            <p className="mt-1 whitespace-pre-line text-xs leading-5">
              {commit.body}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-mono">{commit.shortSha}</span>
            <span>{commit.authorName}</span>
            <RelativeTime value={commit.authorDate} />
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export const ChangesSidebar = memo(function ChangesSidebar({
  diffFiles,
  selectedPath,
  onSelectFile,
  selectedCommit,
  isDiffLoading,
  onRestoreBranchState,
  emptyMessage,
  workingTreeCommitState,
  historyCommits,
  historyIsLoading,
  historyIsRefreshing,
  historyError,
  historySelectedCommitSha,
  onSelectHistoryCommit,
}: {
  diffFiles: DiffListFile[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  selectedCommit: PrCommit | null;
  isDiffLoading: boolean;
  onRestoreBranchState: () => void;
  emptyMessage: string;
  workingTreeCommitState?: {
    selectedFileCount: number;
    totalFileCount: number;
    isSubmitting: boolean;
    error: string | null;
    getFileSelectionType: (path: string) => DiffSelectionType;
    onToggleFileSelection: (path: string) => void;
    onCommit: (draft: { summary: string; description: string }) => Promise<boolean>;
  } | undefined;
  historyCommits: PrCommit[];
  historyIsLoading: boolean;
  historyIsRefreshing: boolean;
  historyError: string | null;
  historySelectedCommitSha: string | null;
  onSelectHistoryCommit: (index: number) => void;
}) {
  const selectedFiles = useMemo(
    () => selectedPath === null ? new Set<string>() : new Set([selectedPath]),
    [selectedPath],
  );

  return (
    <FilesChangedList
      title="Changes"
      files={diffFiles}
      visibleFiles={selectedFiles}
      onSelectFile={onSelectFile}
      getFileSelectionType={workingTreeCommitState?.getFileSelectionType}
      onToggleFileSelection={workingTreeCommitState?.onToggleFileSelection}
      emptyMessage={isDiffLoading ? 'Loading changes...' : emptyMessage}
      topContent={selectedCommit ? (
        <HistorySnapshotBanner
          commit={selectedCommit}
          onRestoreBranchState={onRestoreBranchState}
        />
      ) : undefined}
      bottomContent={workingTreeCommitState ? (
        <CommitComposer
          selectedFileCount={workingTreeCommitState.selectedFileCount}
          totalFileCount={workingTreeCommitState.totalFileCount}
          isSubmitting={workingTreeCommitState.isSubmitting}
          error={workingTreeCommitState.error}
          onCommit={workingTreeCommitState.onCommit}
        />
      ) : undefined}
      actions={(
        <ChangesHistoryDropdown
          commits={historyCommits}
          isLoading={historyIsLoading}
          isRefreshing={historyIsRefreshing}
          error={historyError}
          selectedCommitSha={historySelectedCommitSha}
          onSelectCommit={onSelectHistoryCommit}
          onRestoreWorkingTree={onRestoreBranchState}
        />
      )}
    />
  );
});
