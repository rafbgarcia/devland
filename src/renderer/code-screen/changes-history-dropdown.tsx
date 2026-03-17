import { GitCommitHorizontalIcon, LoaderCircleIcon } from 'lucide-react';

import type { PrCommit } from '@/ipc/contracts';
import { RelativeTime } from '@/renderer/shared/ui/relative-time';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';
import { cn } from '@/shadcn/lib/utils';

export function ChangesHistoryDropdown({
  commits,
  isLoading,
  isRefreshing,
  error,
  selectedCommitSha,
  onSelectCommit,
  onRestoreWorkingTree,
}: {
  commits: PrCommit[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  selectedCommitSha: string | null;
  onSelectCommit: (index: number) => void;
  onRestoreWorkingTree: () => void;
}) {
  const isEmpty = !isLoading && !error && commits.length === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Commit history"
      >
        <GitCommitHorizontalIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        sideOffset={4}
        align="end"
        className="max-h-[22rem] w-[20rem] overflow-y-auto"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2">
            History
            {isRefreshing ? <LoaderCircleIcon className="size-3 animate-spin text-muted-foreground" /> : null}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />

        {selectedCommitSha ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onRestoreWorkingTree}>
                <span className="text-primary">Back to working tree</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-2 py-4 text-xs text-muted-foreground">
            <LoaderCircleIcon className="size-3 animate-spin" />
            Loading history...
          </div>
        ) : error ? (
          <div className="px-2 py-3 text-xs text-destructive">{error}</div>
        ) : isEmpty ? (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            No commits on this branch yet.
          </div>
        ) : (
          <DropdownMenuGroup>
            {commits.map((commit, index) => (
              <DropdownMenuItem
                key={commit.sha}
                onClick={() => onSelectCommit(index)}
                className={cn(
                  'flex flex-col items-start gap-0.5 px-2.5 py-2',
                  commit.sha === selectedCommitSha && 'bg-primary/8',
                )}
              >
                <div className="flex w-full items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {commit.title || commit.shortSha}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    <RelativeTime value={commit.authorDate} />
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-mono">{commit.shortSha}</span>
                  <span>{commit.authorName}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
