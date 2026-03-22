import { memo, useMemo } from 'react';

import {
  AlertCircleIcon,
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
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Button } from '@/shadcn/components/ui/button';
import { Toggle } from '@/shadcn/components/ui/toggle';
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
  onRestoreBranchState,
  emptyMessage,
  workingTreeCommitState,
  historyCommits,
  historyIsLoading,
  historyIsRefreshing,
  historyError,
  historySelectedCommitSha,
  workingTreeSortMode,
  workingTreeSortAvailable,
  onToggleWorkingTreeSortMode,
  onSelectHistoryCommit,
  onOpenFile,
  openFileError,
}: {
  diffFiles: DiffListFile[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  selectedCommit: PrCommit | null;
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
  workingTreeSortAvailable: boolean;
  onToggleWorkingTreeSortMode: () => void;
  onSelectHistoryCommit: (index: number) => void;
  onOpenFile?: ((path: string) => void) | undefined;
  openFileError?: string | null;
}) {
  const selectedFiles = useMemo(
    () => selectedPath === null ? new Set<string>() : new Set([selectedPath]),
    [selectedPath],
  );
  const isCodexSortMode = workingTreeSortMode === 'codex-first-touch';
  const isCodexSortActive = workingTreeSortAvailable && isCodexSortMode;
  const nextSortModeLabel = isCodexSortMode ? 'alphabetically' : ' by Codex change';
  const activeSortModeLabel = workingTreeSortAvailable
    ? isCodexSortMode
      ? 'Sorting by Codex change'
      : 'Sorting alphabetically'
    : <span className='text-center'>Sorting alphabetically<br/><small>Codex change order not available</small></span>;

  return (
    <FilesChangedList
      title="Changes"
      files={diffFiles}
      visibleFiles={selectedFiles}
      onSelectFile={onSelectFile}
      onOpenFile={onOpenFile}
      getFileSelectionType={workingTreeCommitState?.getFileSelectionType}
      onToggleFileSelection={workingTreeCommitState?.onToggleFileSelection}
      emptyMessage={emptyMessage}
      topContent={
        selectedCommit || openFileError ? (
          <>
            {selectedCommit ? (
              <HistorySnapshotBanner
                commit={selectedCommit}
                onRestoreBranchState={onRestoreBranchState}
              />
            ) : null}
            {openFileError ? (
              <div className="border-b border-border px-3 py-2">
                <Alert variant="destructive">
                  <AlertCircleIcon />
                  <AlertTitle>Could not open file</AlertTitle>
                  <AlertDescription>{openFileError}</AlertDescription>
                </Alert>
              </div>
            ) : null}
          </>
        ) : undefined
      }
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
                <span>
                  <Toggle
                    size="sm"
                    pressed={isCodexSortActive}
                    disabled={!workingTreeSortAvailable}
                    aria-label={
                      workingTreeSortAvailable
                        ? `Sort files ${nextSortModeLabel}`
                        : 'Codex change order is unavailable for these files'
                    }
                    className="size-7 text-muted-foreground hover:text-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground disabled:opacity-35"
                    onPressedChange={() => onToggleWorkingTreeSortMode()}
                  >
                    <ArrowDownUpIcon className='size-4' />
                  </Toggle>
                </span>
              </TooltipTrigger>
              <TooltipContent>{activeSortModeLabel}</TooltipContent>
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
