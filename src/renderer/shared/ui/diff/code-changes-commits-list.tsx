import { GitCommitHorizontalIcon, LayersIcon } from 'lucide-react';

import type { PrCommit } from '@/ipc/contracts';
import { cn } from '@/shadcn/lib/utils';

import type { DiffSelection } from './diff-types';

export function CodeChangesCommitsList({
  commits,
  selection,
  onSelectCommit,
  onSelectAll,
}: {
  commits: PrCommit[];
  selection: DiffSelection;
  onSelectCommit: (index: number) => void;
  onSelectAll: () => void;
}) {
  return (
    <div className="flex flex-col border-b border-border">
      <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-foreground">
        <GitCommitHorizontalIcon className="size-3.5 text-muted-foreground" />
        Commits
        <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] font-bold leading-4 text-muted-foreground">
          {commits.length}
        </span>
      </div>
      <div className="max-h-[20vh] overflow-y-auto">
        <button
          type="button"
          onClick={onSelectAll}
          className={cn(
            'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent/50',
            selection.type === 'all' && 'bg-primary/10',
          )}
        >
          <LayersIcon className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">All commits</span>
        </button>
        {commits.map((commit, index) => (
          <button
            key={commit.sha}
            type="button"
            onClick={() => onSelectCommit(index)}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent/50',
              selection.type === 'commit' && selection.index === index && 'bg-primary/10',
            )}
          >
            <span className="size-1.5 shrink-0 rounded-full bg-foreground/40" />
            <span className="truncate">{commit.title || commit.shortSha}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
