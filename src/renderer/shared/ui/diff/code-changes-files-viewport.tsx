import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
} from 'react';

import {
  type DiffFileStatus,
  type DiffCommentAnchor,
  type DiffDisplayMode,
  type DiffSelectionSide,
  type DiffSelectionType,
} from '@/lib/diff';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { cn } from '@/shadcn/lib/utils';

import { DiffFileSection } from './diff-renderer';
import { getExpandedDiffRenderLineCount } from './diff-expansion';
import type { AsyncState } from './diff-types';
import { TruncatedFilePath } from './truncated-file-path';
import { useDiffExpansionState } from './use-diff-expansion-state';
import { type DiffRenderFile } from './use-diff-render-files';

export type DiffListFile = {
  path: string;
  status: DiffFileStatus;
  additions: number;
  deletions: number;
};

const FILE_STATUS_CONFIG: Record<
  DiffRenderFile['status'],
  { letter: string; className: string; dotClassName: string }
> = {
  modified: {
    letter: 'M',
    className: 'text-amber-700',
    dotClassName: 'bg-amber-500',
  },
  added: {
    letter: 'A',
    className: 'text-emerald-700',
    dotClassName: 'bg-emerald-500',
  },
  deleted: {
    letter: 'D',
    className: 'text-rose-700',
    dotClassName: 'bg-rose-500',
  },
  renamed: {
    letter: 'R',
    className: 'text-sky-700',
    dotClassName: 'bg-sky-500',
  },
  copied: {
    letter: 'C',
    className: 'text-sky-700',
    dotClassName: 'bg-sky-500',
  },
  untracked: {
    letter: 'U',
    className: 'text-emerald-700',
    dotClassName: 'bg-emerald-500',
  },
};

const DIFF_ROW_HEIGHT_PX = 22;
const FILE_HEADER_HEIGHT_PX = 34;
const FILE_SECTION_FRAME_PX = 2;
const FILE_GAP_PX = 16;
const VIEWPORT_OVERSCAN_PX = 480;
const VIEWPORT_INSET_PX = 16;

function areVisibleFileSetsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}

function estimateFileHeight(
  file: DiffRenderFile,
  displayMode: DiffDisplayMode,
  expansionState: Record<string, { revealedStartCount: number; revealedEndCount: number }> = {},
) {
  return (
    FILE_HEADER_HEIGHT_PX +
    FILE_SECTION_FRAME_PX +
    getExpandedDiffRenderLineCount({
      file: file.diff,
      rows: file.rows,
      displayMode,
      contents: file.contents,
      expansionState,
    }) * DIFF_ROW_HEIGHT_PX +
    FILE_GAP_PX
  );
}

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

function getRangeForWindow(
  itemHeights: number[],
  offsets: number[],
  windowTop: number,
  windowBottom: number,
) {
  if (itemHeights.length === 0) {
    return { start: 0, end: 0 };
  }

  let start = 0;
  while (start < itemHeights.length && offsets[start]! + itemHeights[start]! < windowTop) {
    start++;
  }

  let end = start;
  while (end < itemHeights.length && offsets[end]! < windowBottom) {
    end++;
  }

  return { start, end };
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
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);

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
        setFocusedIndex((i) => {
          const next = Math.min(i + 1, files.length - 1);
          const file = files[next];
          if (file) {
            onSelectFile(file.path);
          }
          return next;
        });
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusedIndex((i) => {
          const next = Math.max(i - 1, 0);
          const file = files[next];
          if (file) {
            onSelectFile(file.path);
          }
          return next;
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
              className={cn(
                'flex min-w-0 w-full items-center gap-2 px-2 py-1.25 text-xs cursor-default',
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
              <TruncatedFilePath path={file.path} className="min-w-0 flex-1 text-xs" />
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

export type CodeChangesSidebarRenderProps = {
  diffFiles: DiffRenderFile[];
  visibleFiles: Set<string>;
  onSelectFile: (path: string) => void;
};

export type CodeChangesViewportHandle = {
  scrollToFile: (path: string) => void;
};

type CodeChangesFilesViewportProps = {
  rawDiff: AsyncState<string>;
  diffFiles: DiffRenderFile[];
  displayMode: DiffDisplayMode;
  sidebar?: ReactNode | ((props: CodeChangesSidebarRenderProps) => ReactNode);
  mainTop?: ReactNode;
  emptyMessage: string;
  onVisibleFilesChange?: ((files: Set<string>) => void) | undefined;
  getFileSelectionType?: ((path: string) => DiffSelectionType) | undefined;
  getRowSelectionType?: ((
    path: string,
    row: DiffRenderFile['rows'][number],
    side?: DiffSelectionSide,
  ) => DiffSelectionType) | undefined;
  getHunkSelectionType?: ((path: string, hunkStartLineNumber: number) => DiffSelectionType) | undefined;
  onToggleFileSelection?: ((path: string) => void) | undefined;
  onToggleRowSelection?: ((
    path: string,
    row: DiffRenderFile['rows'][number],
    side?: DiffSelectionSide,
  ) => void) | undefined;
  onToggleHunkSelection?: ((path: string, hunkStartLineNumber: number) => void) | undefined;
  onSubmitComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
};

export const CodeChangesFilesViewport = forwardRef<CodeChangesViewportHandle, CodeChangesFilesViewportProps>(
  function CodeChangesFilesViewport({
    rawDiff,
    diffFiles,
    displayMode,
    sidebar,
    mainTop,
    emptyMessage,
    onVisibleFilesChange,
    getFileSelectionType,
    getRowSelectionType,
    getHunkSelectionType,
    onToggleFileSelection,
    onToggleRowSelection,
    onToggleHunkSelection,
    onSubmitComment,
  }, ref) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [layoutVersion, setLayoutVersion] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileElementRefsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const fileRefCallbacksRef = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());
  const sizeCacheRef = useRef<Map<string, number>>(new Map());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const diffFilesKey = useMemo(
    () => diffFiles.map((file) => file.path).join('\0'),
    [diffFiles],
  );
  const { getFileExpansionState, expandFileGap } = useDiffExpansionState(rawDiff);

  useEffect(() => {
    fileElementRefsRef.current.clear();
    fileRefCallbacksRef.current.clear();
    sizeCacheRef.current.clear();
    setScrollTop(0);
    setLayoutVersion(0);
    scrollContainerRef.current?.scrollTo(0, 0);
  }, [diffFilesKey]);

  useEffect(() => {
    sizeCacheRef.current.clear();
    setLayoutVersion((current) => current + 1);
  }, [displayMode]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }

    const updateHeight = () => {
      setContainerHeight(scrollContainer.clientHeight);
    };

    updateHeight();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });

    observer.observe(scrollContainer);
    return () => observer.disconnect();
  }, [diffFiles.length, rawDiff.status]);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      let hasChanges = false;

      for (const entry of entries) {
        const path = (entry.target as HTMLElement).dataset.filePath;
        if (!path) {
          continue;
        }

        const nextHeight = Math.ceil(entry.contentRect.height) + FILE_GAP_PX;
        if (sizeCacheRef.current.get(path) === nextHeight) {
          continue;
        }

        sizeCacheRef.current.set(path, nextHeight);
        hasChanges = true;
      }

      if (hasChanges) {
        setLayoutVersion((current) => current + 1);
      }
    });

    resizeObserverRef.current = observer;
    return () => observer.disconnect();
  }, []);

  const getSectionRef = useCallback((path: string) => {
    const existingRef = fileRefCallbacksRef.current.get(path);
    if (existingRef) {
      return existingRef;
    }

    const nextRef = (el: HTMLDivElement | null) => {
      const previous = fileElementRefsRef.current.get(path);
      if (previous && previous !== el) {
        resizeObserverRef.current?.unobserve(previous);
      }

      if (el) {
        fileElementRefsRef.current.set(path, el);
        resizeObserverRef.current?.observe(el);

        const measuredHeight = Math.ceil(el.getBoundingClientRect().height) + FILE_GAP_PX;
        if (sizeCacheRef.current.get(path) !== measuredHeight) {
          sizeCacheRef.current.set(path, measuredHeight);
          setLayoutVersion((current) => current + 1);
        }

        return;
      }

      fileElementRefsRef.current.delete(path);
    };

    fileRefCallbacksRef.current.set(path, nextRef);
    return nextRef;
  }, []);

  const itemHeights = useMemo(
    () => diffFiles.map((file) => sizeCacheRef.current.get(file.path) ?? estimateFileHeight(
      file,
      displayMode,
      getFileExpansionState(file.path),
    )),
    [diffFiles, displayMode, getFileExpansionState, layoutVersion],
  );

  const offsets = useMemo(() => {
    const nextOffsets: number[] = [];
    let currentOffset = 0;

    for (const height of itemHeights) {
      nextOffsets.push(currentOffset);
      currentOffset += height;
    }

    return nextOffsets;
  }, [itemHeights]);

  const totalHeight = useMemo(
    () => itemHeights.reduce((sum, height) => sum + height, 0),
    [itemHeights],
  );

  const renderRange = useMemo(
    () => getRangeForWindow(
      itemHeights,
      offsets,
      Math.max(0, scrollTop - VIEWPORT_OVERSCAN_PX),
      scrollTop + containerHeight + VIEWPORT_OVERSCAN_PX,
    ),
    [containerHeight, itemHeights, offsets, scrollTop],
  );

  const visibleRange = useMemo(
    () => getRangeForWindow(
      itemHeights,
      offsets,
      scrollTop,
      scrollTop + containerHeight,
    ),
    [containerHeight, itemHeights, offsets, scrollTop],
  );

  const visibleFiles = useMemo(
    () => new Set(diffFiles.slice(visibleRange.start, visibleRange.end).map((file) => file.path)),
    [diffFiles, visibleRange.end, visibleRange.start],
  );
  const lastReportedVisibleFilesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (areVisibleFileSetsEqual(lastReportedVisibleFilesRef.current, visibleFiles)) {
      return;
    }

    lastReportedVisibleFilesRef.current = visibleFiles;
    onVisibleFilesChange?.(visibleFiles);
  }, [visibleFiles, onVisibleFilesChange]);

  const scrollToFile = useCallback((path: string) => {
    const fileIndex = diffFiles.findIndex((file) => file.path === path);
    if (fileIndex === -1) {
      return;
    }

    scrollContainerRef.current?.scrollTo({
      top: Math.max(0, offsets[fileIndex]!),
      behavior: 'instant',

    });
  }, [diffFiles, offsets]);

  useImperativeHandle(ref, () => ({ scrollToFile }), [scrollToFile]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  const sidebarContent = useMemo(() => {
    if (typeof sidebar === 'function') {
      return sidebar({
        diffFiles,
        visibleFiles,
        onSelectFile: scrollToFile,
      });
    }

    return sidebar ?? null;
  }, [diffFiles, scrollToFile, sidebar, visibleFiles]);

  return (
    <div className="flex min-h-0 flex-1">
      {sidebarContent ? (
        <div className="flex w-72 shrink-0 flex-col overflow-hidden border-r border-border">
          {sidebarContent}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col overflow-hidden">
        {mainTop}

        {rawDiff.status === 'loading' && (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-3.5" />
              Loading diff...
            </div>
          </div>
        )}

        {rawDiff.status === 'error' && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-destructive">{rawDiff.error}</p>
          </div>
        )}

        {rawDiff.status === 'ready' && diffFiles.length === 0 && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        )}

        {rawDiff.status === 'ready' && diffFiles.length > 0 && (
          <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
            <div className="relative" style={{ height: totalHeight + VIEWPORT_INSET_PX * 2 }}>
              {diffFiles.slice(renderRange.start, renderRange.end).map((file, index) => {
                const fileIndex = renderRange.start + index;

                return (
                  <div
                    key={file.path}
                    className="absolute"
                    style={{
                      top: offsets[fileIndex]! + VIEWPORT_INSET_PX,
                      left: VIEWPORT_INSET_PX,
                      right: VIEWPORT_INSET_PX,
                    }}
                  >
                    <DiffFileSection
                      file={file}
                      displayMode={displayMode}
                      sectionRef={getSectionRef(file.path)}
                      selectionType={getFileSelectionType?.(file.path)}
                      getRowSelectionType={getRowSelectionType
                        ? (row, side) => getRowSelectionType(file.path, row, side)
                        : undefined}
                      getHunkSelectionType={getHunkSelectionType ? (hunkStartLineNumber) => getHunkSelectionType(file.path, hunkStartLineNumber) : undefined}
                      onToggleFileSelection={onToggleFileSelection ? () => onToggleFileSelection(file.path) : undefined}
                      onToggleRowSelection={onToggleRowSelection
                        ? (row, side) => onToggleRowSelection(file.path, row, side)
                        : undefined}
                      onToggleHunkSelection={onToggleHunkSelection ? (hunkStartLineNumber) => onToggleHunkSelection(file.path, hunkStartLineNumber) : undefined}
                      onSubmitComment={onSubmitComment}
                      expansionState={getFileExpansionState(file.path)}
                      onExpandGap={(gap, action) => expandFileGap(file.path, gap, action)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
