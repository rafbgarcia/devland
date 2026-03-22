import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import type { DiffFileStatus, DiffSelectionType } from '@/lib/diff';
import { cn } from '@/shadcn/lib/utils';

import { TruncatedFilePath } from './truncated-file-path';

export type DiffListFile = {
  path: string;
  status: DiffFileStatus;
  additions: number;
  deletions: number;
};

const FILE_STATUS_CONFIG: Record<
  DiffListFile['status'],
  { letter: string; className: string }
> = {
  modified: {
    letter: 'M',
    className: 'text-amber-700',
  },
  added: {
    letter: 'A',
    className: 'text-emerald-700',
  },
  deleted: {
    letter: 'D',
    className: 'text-rose-700',
  },
  renamed: {
    letter: 'R',
    className: 'text-sky-700',
  },
  copied: {
    letter: 'C',
    className: 'text-sky-700',
  },
  untracked: {
    letter: 'U',
    className: 'text-emerald-700',
  },
};

function FileSelectionToggle({
  selectionType,
  onClick,
}: {
  selectionType: DiffSelectionType;
  onClick: () => void;
}) {
  return (
    <input
      type="checkbox"
      checked={selectionType === 'all'}
      ref={(el) => {
        if (el) {
          el.indeterminate = selectionType === 'partial';
        }
      }}
      onChange={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onClick={(event) => event.stopPropagation()}
      className="pointer-events-auto shrink-0"
    />
  );
}

export function FilesChangedList({
  title = 'Files changed',
  files,
  visibleFiles,
  onSelectFile,
  actions,
  topContent,
  bottomContent,
  emptyMessage = 'No changed files.',
  getFileSelectionType,
  onToggleFileSelection,
  onOpenFile,
}: {
  title?: string;
  files: DiffListFile[];
  visibleFiles: Set<string>;
  onSelectFile: (path: string) => void;
  actions?: ReactNode;
  topContent?: ReactNode;
  bottomContent?: ReactNode;
  emptyMessage?: string;
  getFileSelectionType?: ((path: string) => DiffSelectionType) | undefined;
  onToggleFileSelection?: ((path: string) => void) | undefined;
  onOpenFile?: ((path: string) => void) | undefined;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const selectedFileKey = useMemo(
    () => [...visibleFiles].sort().join('\0'),
    [visibleFiles],
  );

  useEffect(() => {
    if (files.length === 0) {
      setFocusedIndex(-1);
      return;
    }

    const selectedIndex = files.findIndex((file) => visibleFiles.has(file.path));
    if (selectedIndex !== -1) {
      setFocusedIndex(selectedIndex);
    }
  }, [files, selectedFileKey, visibleFiles]);

  useEffect(() => {
    if (focusedIndex < 0 || focusedIndex >= files.length) {
      return;
    }

    const listElement = listRef.current;
    if (!listElement) {
      return;
    }

    const child = listElement.children[focusedIndex] as HTMLElement | undefined;
    child?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex, files.length]);

  const handleListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (files.length === 0) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusedIndex((index) => {
          const nextIndex = Math.min(index + 1, files.length - 1);
          const file = files[nextIndex];
          if (file) {
            onSelectFile(file.path);
          }
          return nextIndex;
        });
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusedIndex((index) => {
          const nextIndex = Math.max(index - 1, 0);
          const file = files[nextIndex];
          if (file) {
            onSelectFile(file.path);
          }
          return nextIndex;
        });
        return;
      }

      if (event.key === ' ' && onToggleFileSelection) {
        event.preventDefault();
        const file = files[focusedIndex];
        if (file) {
          onToggleFileSelection(file.path);
        }
      }
    },
    [files, focusedIndex, onSelectFile, onToggleFileSelection],
  );

  const handleRowClick = useCallback(
    (index: number, path: string) => {
      setFocusedIndex(index);
      onSelectFile(path);
    },
    [onSelectFile],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-semibold text-foreground">
        {title}
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold leading-4 text-muted-foreground">
          {files.length}
        </span>
        {actions ? (
          <div className="ml-auto flex items-center gap-1">
            {actions}
          </div>
        ) : null}
      </div>
      {topContent}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto focus:outline-none"
        tabIndex={0}
        onKeyDown={handleListKeyDown}
        role="listbox"
        aria-label="Changed files"
      >
        {files.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            {emptyMessage}
          </div>
        ) : files.map((file, index) => {
          const config = FILE_STATUS_CONFIG[file.status];
          const isSelected = visibleFiles.has(file.path);

          return (
            <div
              key={file.path}
              role="option"
              aria-selected={isSelected}
              onClick={() => handleRowClick(index, file.path)}
              onDoubleClick={() => onOpenFile?.(file.path)}
              className={cn(
                'flex min-w-0 w-full cursor-default select-none items-center gap-2 px-2 py-1.25 text-xs',
                isSelected
                  ? 'bg-primary/20 text-foreground'
                  : 'text-foreground/90 hover:bg-accent',
              )}
            >
              {getFileSelectionType && onToggleFileSelection ? (
                <FileSelectionToggle
                  selectionType={getFileSelectionType(file.path)}
                  onClick={() => onToggleFileSelection(file.path)}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <TruncatedFilePath path={file.path} className="text-xs" />
              </div>
              <span
                className={cn(
                  'inline-flex size-[18px] shrink-0 items-center justify-center rounded-[3px] border border-current/20 text-[9px] font-bold leading-none',
                  config.className,
                )}
              >
                {config.letter}
              </span>
            </div>
          );
        })}
      </div>
      {bottomContent}
    </div>
  );
}
