import {
  GitCommitHorizontalIcon,
  HistoryIcon,
  Undo2Icon,
} from 'lucide-react';

import type { PrCommit } from '@/ipc/contracts';
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

export function CodeChangesSidebar({
  diffFiles,
  visibleFiles,
  onSelectFile,
  selectedCommit,
  isDiffLoading,
  onOpenHistory,
  onRestoreBranchState,
  emptyMessage,
}: CodeChangesSidebarRenderProps & {
  selectedCommit: PrCommit | null;
  isDiffLoading: boolean;
  onOpenHistory: () => void;
  onRestoreBranchState: () => void;
  emptyMessage: string;
}) {
  return (
    <FilesChangedList
      title="Changes"
      files={diffFiles}
      visibleFiles={visibleFiles}
      onSelectFile={onSelectFile}
      emptyMessage={isDiffLoading ? 'Loading changes...' : emptyMessage}
      topContent={selectedCommit ? (
        <HistorySnapshotBanner
          commit={selectedCommit}
          onRestoreBranchState={onRestoreBranchState}
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
