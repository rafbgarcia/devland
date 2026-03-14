import { useMemo, useState } from 'react';

import {
  CheckIcon,
  GitBranchIcon,
  SearchIcon,
} from 'lucide-react';

import type { GitBranch, GitFileStatus, GitStatusFile } from '@/ipc/contracts';
import { Input } from '@/shadcn/components/ui/input';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { cn } from '@/shadcn/lib/utils';

const FILE_STATUS_BADGE: Record<
  GitFileStatus,
  { letter: string; className: string; dotClassName: string }
> = {
  modified: {
    letter: 'M',
    className: 'text-yellow-600 dark:text-yellow-400',
    dotClassName: 'bg-yellow-500',
  },
  added: {
    letter: 'A',
    className: 'text-green-600 dark:text-green-400',
    dotClassName: 'bg-green-500',
  },
  deleted: {
    letter: 'D',
    className: 'text-red-600 dark:text-red-400',
    dotClassName: 'bg-red-500',
  },
  renamed: {
    letter: 'R',
    className: 'text-blue-600 dark:text-blue-400',
    dotClassName: 'bg-blue-500',
  },
  untracked: {
    letter: 'U',
    className: 'text-green-600 dark:text-green-400',
    dotClassName: 'bg-green-500',
  },
};

function BranchSelector({
  branches,
  isLoading,
  onBranchChange,
}: {
  branches: GitBranch[];
  isLoading: boolean;
  onBranchChange: (branchName: string) => void;
}) {
  const currentBranch = branches.find((b) => b.isCurrent);
  const [isOpen, setIsOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
        <Spinner className="size-3" />
        Loading branches...
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <GitBranchIcon className="size-3 text-muted-foreground" />
        <span className="truncate font-medium">{currentBranch?.name ?? 'HEAD'}</span>
      </button>

      {isOpen ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 z-50 mt-0.5 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg">
            {branches.map((branch) => (
              <button
                key={branch.name}
                className="flex w-full items-center gap-2 px-3 py-1 text-left text-xs transition-colors hover:bg-accent"
                onClick={() => {
                  if (!branch.isCurrent) {
                    onBranchChange(branch.name);
                  }

                  setIsOpen(false);
                }}
                type="button"
              >
                <CheckIcon
                  className={cn(
                    'size-3 shrink-0',
                    branch.isCurrent ? 'text-foreground' : 'text-transparent',
                  )}
                />
                <span className="truncate">{branch.name}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function FileStatusList({
  files,
  filter,
  selectedFilePath,
  onSelectFile,
}: {
  files: GitStatusFile[];
  filter: string;
  selectedFilePath: string | null;
  onSelectFile: (filePath: string) => void;
}) {
  const filteredFiles = useMemo(() => {
    if (!filter) return files;

    const lower = filter.toLowerCase();

    return files.filter((f) => f.path.toLowerCase().includes(lower));
  }, [files, filter]);

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-10 text-center">
        <CheckIcon className="size-5 text-green-500" />
        <p className="text-xs text-muted-foreground">No local changes</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {filteredFiles.map((file) => {
        const badge = FILE_STATUS_BADGE[file.status];
        const isSelected = file.path === selectedFilePath;
        const fileName = file.path.split('/').pop() ?? file.path;
        const directory = file.path.includes('/')
          ? file.path.slice(0, file.path.lastIndexOf('/') + 1)
          : '';

        return (
          <button
            key={file.path}
            className={cn(
              'group flex items-center gap-2 px-3 py-[5px] text-left transition-colors hover:bg-accent/50',
              isSelected && 'bg-accent',
            )}
            onClick={() => onSelectFile(file.path)}
            type="button"
          >
            <span className={cn('size-1.5 shrink-0 rounded-full', badge.dotClassName)} />
            <span className="min-w-0 flex-1 truncate text-xs">
              {directory ? (
                <span className="text-muted-foreground">{directory}</span>
              ) : null}
              <span className="font-bold">{fileName}</span>
            </span>
            <span
              className={cn(
                'inline-flex size-[18px] shrink-0 items-center justify-center rounded-sm border text-[10px] font-bold leading-none',
                badge.className,
                'border-current/20',
              )}
            >
              {badge.letter}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function CodeSidebar({
  branches,
  isBranchesLoading,
  files,
  isStatusLoading,
  selectedFilePath,
  onBranchChange,
  onSelectFile,
}: {
  branches: GitBranch[];
  isBranchesLoading: boolean;
  files: GitStatusFile[];
  isStatusLoading: boolean;
  selectedFilePath: string | null;
  onBranchChange: (branchName: string) => void;
  onSelectFile: (filePath: string) => void;
}) {
  const [filter, setFilter] = useState('');

  return (
    <div className="flex w-72 shrink-0 flex-col border-r border-border">
      {/* Branch bar */}
      <div className="border-b border-border">
        <BranchSelector
          branches={branches}
          isLoading={isBranchesLoading}
          onBranchChange={onBranchChange}
        />
      </div>

      {/* Changes tab header */}
      <div className="flex items-center border-b border-border">
        <div className="flex items-center gap-1.5 border-b-2 border-foreground px-3 py-2">
          <span className="text-xs font-semibold">Changes</span>
          {files.length > 0 ? (
            <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-accent-foreground">
              {files.length}
            </span>
          ) : null}
        </div>
      </div>

      {/* Filter */}
      <div className="border-b border-border px-2 py-1.5">
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-7 pl-7 text-xs"
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter changed files"
            type="text"
            value={filter}
          />
        </div>
      </div>

      {/* File count */}
      <div className="border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        {files.length} changed {files.length === 1 ? 'file' : 'files'}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {isStatusLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-3" />
              Loading changes...
            </div>
          </div>
        ) : (
          <FileStatusList
            files={files}
            filter={filter}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
          />
        )}
      </div>
    </div>
  );
}
