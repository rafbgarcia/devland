import { useMemo, type ReactNode } from 'react';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react';

import type { PrCommit } from '@/ipc/contracts';
import type { DiffDisplayMode } from '@/lib/diff';
import { CodeChangesCommitsList } from '@/renderer/shared/ui/diff/code-changes-commits-list';
import {
  FilesChangedList,
  type DiffListFile,
} from '@/renderer/shared/ui/diff/files-changed-list';
import { SingleFileDiffView } from '@/renderer/shared/ui/diff/single-file-diff-view';
import type { AsyncState, DiffSelection } from '@/renderer/shared/ui/diff/diff-types';
import { type DiffRenderFile } from '@/renderer/shared/ui/diff/use-diff-render-files';
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
  selectedFilePath,
  selectedFile,
  onSelectFile,
  diffDisplayToolbar,
  displayMode,
}: {
  commits: PrCommit[];
  selection: DiffSelection;
  onSelectCommit: (index: number) => void;
  onSelectAll: () => void;
  baseBranch: string;
  headBranch: string;
  rawDiff: AsyncState<string>;
  diffFiles: DiffListFile[];
  selectedFilePath: string | null;
  selectedFile: DiffRenderFile | null;
  onSelectFile: (path: string) => void;
  diffDisplayToolbar: ReactNode;
  displayMode: DiffDisplayMode;
}) {
  const selectedFiles = useMemo(
    () => selectedFilePath === null ? new Set<string>() : new Set([selectedFilePath]),
    [selectedFilePath],
  );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-border">
        <FilesChangedList
          files={diffFiles}
          visibleFiles={selectedFiles}
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
      </div>

      <SingleFileDiffView
        rawDiff={rawDiff}
        selectedFile={selectedFile}
        displayMode={displayMode}
        emptyMessage="No file changes in this commit."
        topContent={(
          <>
            {diffDisplayToolbar}
            <CommitCarousel
              commits={commits}
              selection={selection}
              onSelectCommit={onSelectCommit}
              baseBranch={baseBranch}
              headBranch={headBranch}
            />
          </>
        )}
      />
    </div>
  );
}
