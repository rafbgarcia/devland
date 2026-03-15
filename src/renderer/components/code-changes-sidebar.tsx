import {
  GitCommitHorizontalIcon,
  HistoryIcon,
  Undo2Icon,
} from 'lucide-react';

import type { PrCommit } from '@/ipc/contracts';
import type { DiffSelectionType } from '@/lib/diff';
import {
  FilesChangedList,
  type CodeChangesSidebarRenderProps,
} from '@/renderer/components/code-changes-files-viewport';
import { RelativeTime } from '@/ui/relative-time';
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
import { Textarea } from '@/shadcn/components/ui/textarea';

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

function CommitComposer({
  selectedFileCount,
  totalFileCount,
  summary,
  description,
  isSubmitting,
  error,
  hasStagedChanges,
  onSummaryChange,
  onDescriptionChange,
  onCommit,
}: {
  selectedFileCount: number;
  totalFileCount: number;
  summary: string;
  description: string;
  isSubmitting: boolean;
  error: string | null;
  hasStagedChanges: boolean;
  onSummaryChange: (summary: string) => void;
  onDescriptionChange: (description: string) => void;
  onCommit: () => void;
}) {
  return (
    <div className="border-t border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-foreground">
          Commit {selectedFileCount} of {totalFileCount} {totalFileCount === 1 ? 'file' : 'files'}
        </div>
      </div>

      {hasStagedChanges ? (
        <Alert className="mb-3">
          <AlertTitle>Existing staged changes detected</AlertTitle>
          <AlertDescription>
            Devland commit selection currently requires a clean index. Clear staged changes in Git before committing here.
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert className="mb-3">
          <AlertTitle>Commit failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Textarea
          value={summary}
          onChange={(event) => onSummaryChange(event.target.value)}
          placeholder="Commit summary"
          rows={2}
          disabled={isSubmitting || hasStagedChanges}
        />
        <Textarea
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Description (optional)"
          rows={4}
          disabled={isSubmitting || hasStagedChanges}
        />
        <Button
          type="button"
          onClick={onCommit}
          disabled={
            isSubmitting ||
            hasStagedChanges ||
            selectedFileCount === 0 ||
            summary.trim().length === 0
          }
        >
          <GitCommitHorizontalIcon data-icon="inline-start" />
          {isSubmitting ? 'Committing…' : 'Commit selected changes'}
        </Button>
      </div>
    </div>
  );
}

export function CodeChangesSidebar({
  diffFiles,
  visibleFiles,
  onSelectFile,
  selectedCommit,
  isDiffLoading,
  onOpenHistory,
  onRestoreBranchState,
  emptyMessage,
  workingTreeCommitState,
}: CodeChangesSidebarRenderProps & {
  selectedCommit: PrCommit | null;
  isDiffLoading: boolean;
  onOpenHistory: () => void;
  onRestoreBranchState: () => void;
  emptyMessage: string;
  workingTreeCommitState?: {
    selectedFileCount: number;
    totalFileCount: number;
    summary: string;
    description: string;
    isSubmitting: boolean;
    error: string | null;
    hasStagedChanges: boolean;
    getFileSelectionType: (path: string) => DiffSelectionType;
    onToggleFileSelection: (path: string) => void;
    onSummaryChange: (summary: string) => void;
    onDescriptionChange: (description: string) => void;
    onCommit: () => void;
  } | undefined;
}) {
  return (
    <FilesChangedList
      title="Changes"
      files={diffFiles}
      visibleFiles={visibleFiles}
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
          summary={workingTreeCommitState.summary}
          description={workingTreeCommitState.description}
          isSubmitting={workingTreeCommitState.isSubmitting}
          error={workingTreeCommitState.error}
          hasStagedChanges={workingTreeCommitState.hasStagedChanges}
          onSummaryChange={workingTreeCommitState.onSummaryChange}
          onDescriptionChange={workingTreeCommitState.onDescriptionChange}
          onCommit={workingTreeCommitState.onCommit}
        />
      ) : undefined}
      actions={(
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              type="button"
              variant="ghost"
              className="size-7"
              aria-label="Open history"
              onClick={onOpenHistory}
            >
              <HistoryIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open history</TooltipContent>
        </Tooltip>
      )}
    />
  );
}
