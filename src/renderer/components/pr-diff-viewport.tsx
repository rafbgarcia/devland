import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react';

import type { PrCommit } from '@/ipc/contracts';
import { CodeChangesCommitsList } from '@/renderer/components/code-changes-commits-list';
import {
  CodeChangesFilesViewport,
  FilesChangedList,
} from '@/renderer/components/code-changes-files-viewport';
import { type DiffRenderFile } from '@/renderer/hooks/use-diff-render-files';
import { type AsyncState, type DiffSelection } from '@/renderer/hooks/use-pr-diff-data';
import { cn } from '@/shadcn/lib/utils';

function CommitCarousel({
  commits,
  selection,
  onSelectCommit,
  baseBranch,
  headBranch,
}: {
  commits: PrCommit[];
  selection: DiffSelection;
  onSelectCommit: (index: number) => void;
  baseBranch: string;
  headBranch: string;
}) {
  if (selection.type === 'all') {
    return (
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">
            All changes
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {commits.length} {commits.length === 1 ? 'commit' : 'commits'}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            {baseBranch} {'<-'} {headBranch}
          </span>
        </div>
      </div>
    );
  }

  const { index } = selection;
  const commit = commits[index]!;
  const hasPrev = index > 0;
  const hasNext = index < commits.length - 1;

  return (
    <div className="flex items-stretch border-b border-border">
      <button
        type="button"
        disabled={!hasPrev}
        onClick={() => hasPrev && onSelectCommit(index - 1)}
        className={cn(
          'flex w-36 shrink-0 items-center gap-1.5 border-r border-border px-3 py-2.5 text-left text-xs transition-colors',
          hasPrev ? 'hover:bg-muted/50' : 'opacity-40',
        )}
      >
        <ChevronLeftIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-muted-foreground">
          {hasPrev ? commits[index - 1]!.title || commits[index - 1]!.shortSha : ''}
        </span>
      </button>

      <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{commit.title || commit.shortSha}</span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{commit.shortSha}</span>
        </div>
        {commit.body && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{commit.body}</p>
        )}
      </div>

      <button
        type="button"
        disabled={!hasNext}
        onClick={() => hasNext && onSelectCommit(index + 1)}
        className={cn(
          'flex w-36 shrink-0 items-center justify-end gap-1.5 border-l border-border px-3 py-2.5 text-right text-xs transition-colors',
          hasNext ? 'hover:bg-muted/50' : 'opacity-40',
        )}
      >
        <span className="truncate text-muted-foreground">
          {hasNext ? commits[index + 1]!.title || commits[index + 1]!.shortSha : ''}
        </span>
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}

export function PrDiffViewport({
  commits,
  selection,
  onSelectCommit,
  onSelectAll,
  baseBranch,
  headBranch,
  rawDiff,
  diffFiles,
}: {
  commits: PrCommit[];
  selection: DiffSelection;
  onSelectCommit: (index: number) => void;
  onSelectAll: () => void;
  baseBranch: string;
  headBranch: string;
  rawDiff: AsyncState<string>;
  diffFiles: DiffRenderFile[];
}) {
  return (
    <CodeChangesFilesViewport
      rawDiff={rawDiff}
      diffFiles={diffFiles}
      emptyMessage="No file changes in this commit."
      sidebar={({ diffFiles: sidebarDiffFiles, visibleFiles, onSelectFile }) => (
        <FilesChangedList
          files={sidebarDiffFiles}
          visibleFiles={visibleFiles}
          onSelectFile={onSelectFile}
          topContent={(
            <CodeChangesCommitsList
              commits={commits}
              selection={selection}
              onSelectCommit={onSelectCommit}
              onSelectAll={onSelectAll}
            />
          )}
        />
      )}
      mainTop={(
        <CommitCarousel
          commits={commits}
          selection={selection}
          onSelectCommit={onSelectCommit}
          baseBranch={baseBranch}
          headBranch={headBranch}
        />
      )}
    />
  );
}
