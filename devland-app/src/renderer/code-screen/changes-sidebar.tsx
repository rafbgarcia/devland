import { memo, useMemo } from 'react';

import {
  ArrowDownUpIcon,
  GitCommitHorizontalIcon,
  Undo2Icon,
} from 'lucide-react';

import type { PrCommit } from '@/ipc/contracts';
import type { DiffSelectionType } from '@/lib/diff';
import type { CodexChangeSortMode } from '@/renderer/code-screen/codex-change-order';
import {
  FilesChangedList,
  type DiffListFile,
} from '@/renderer/shared/ui/diff/files-changed-list';
import { ChangesHistoryDropdown } from '@/renderer/code-screen/changes-history-dropdown';
import { CommitComposer } from '@/renderer/code-screen/commit-composer';
import { RelativeTime } from '@/renderer/shared/ui/relative-time';
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
    <div className="border-b border-border px-3 py-2">
      <div className="flex items-start gap-2.5 rounded-md border border-border/60 bg-muted/40 px-3 py-2.5">
        <GitCommitHorizontalIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">
            {commit.title || commit.shortSha}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="font-mono">{commit.shortSha}</span>
            <span className="text-border">·</span>
            <span className="truncate">{commit.authorName}</span>
            <span className="text-border">·</span>
            <RelativeTime value={commit.authorDate} />
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              type="button"
              variant="ghost"
              className="size-6 shrink-0"
              aria-label="Back to working tree"
              onClick={onRestoreBranchState}
            >
              <Undo2Icon className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Back to working tree</TooltipContent>
        </Tooltip>
      </div>
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
  workingTreeSortMode,
  onToggleWorkingTreeSortMode,
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
  workingTreeSortMode: CodexChangeSortMode;
  onToggleWorkingTreeSortMode: () => void;
  onSelectHistoryCommit: (index: number) => void;
}) {
  const selectedFiles = useMemo(
    () => selectedPath === null ? new Set<string>() : new Set([selectedPath]),
    [selectedPath],
  );
  const isCodexSortMode = workingTreeSortMode === 'codex-first-touch';
  const nextSortModeLabel = isCodexSortMode ? 'alphabetical order' : 'Codex change order';
  const activeSortModeLabel = isCodexSortMode ? 'Codex change order' : 'alphabetical order';

  return (
    <FilesChangedList
      title="Changes"
      files={diffFiles}
      visibleFiles={selectedFiles}
      onSelectFile={onSelectFile}
      getFileSelectionType={workingTreeCommitState?.getFileSelectionType}
      onToggleFileSelection={workingTreeCommitState?.onToggleFileSelection}
      emptyMessage={emptyMessage}
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
        <>
          {selectedCommit === null ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  type="button"
                  variant="ghost"
                  className="size-7"
                  aria-label={`Sort files by ${nextSortModeLabel}`}
                  aria-pressed={isCodexSortMode}
                  onClick={onToggleWorkingTreeSortMode}
                >
                  <ArrowDownUpIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{`Sort: ${activeSortModeLabel}`}</TooltipContent>
            </Tooltip>
          ) : null}
          <ChangesHistoryDropdown
            commits={historyCommits}
            isLoading={historyIsLoading}
            isRefreshing={historyIsRefreshing}
            error={historyError}
            selectedCommitSha={historySelectedCommitSha}
            onSelectCommit={onSelectHistoryCommit}
            onRestoreWorkingTree={onRestoreBranchState}
          />
        </>
      )}
    />
  );
});
