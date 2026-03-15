import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from 'react';

import { FileCodeIcon } from 'lucide-react';

import { DiffRow } from '@/renderer/components/code-diff-viewer';
import { TruncatedFilePath } from '@/renderer/components/truncated-file-path';
import { parseDiff, type DiffFile, type DiffFileStatus } from '@/renderer/lib/code-diff';
import { type AsyncState } from '@/renderer/hooks/use-pr-diff-data';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { cn } from '@/shadcn/lib/utils';

const FILE_STATUS_CONFIG: Record<
  DiffFileStatus,
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
};

const DIFF_ROW_HEIGHT_PX = 22;
const FILE_HEADER_HEIGHT_PX = 34;
const FILE_SECTION_FRAME_PX = 2;
const FILE_GAP_PX = 16;
const VIEWPORT_OVERSCAN_PX = 480;
const VIEWPORT_INSET_PX = 16;

function estimateFileHeight(file: DiffFile) {
  return (
    FILE_HEADER_HEIGHT_PX +
    FILE_SECTION_FRAME_PX +
    file.renderLineCount * DIFF_ROW_HEIGHT_PX +
    FILE_GAP_PX
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
  files,
  visibleFiles,
  onSelectFile,
}: {
  files: DiffFile[];
  visibleFiles: Set<string>;
  onSelectFile: (path: string) => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-foreground">
        <FileCodeIcon className="size-3.5 text-muted-foreground" />
        Files changed
        <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] font-bold leading-4 text-muted-foreground">
          {files.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {files.map((file) => {
          const config = FILE_STATUS_CONFIG[file.status];
          const isVisible = visibleFiles.has(file.path);

          return (
            <button
              key={file.path}
              type="button"
              onClick={() => onSelectFile(file.path)}
              className={cn(
                'flex min-w-0 w-full items-center gap-2 px-3 py-[5px] text-left text-xs transition-colors hover:bg-accent/50',
                isVisible && 'bg-primary/10',
              )}
            >
              <span className={cn('size-1.5 shrink-0 rounded-full', config.dotClassName)} />
              <TruncatedFilePath path={file.path} className="flex-1 text-xs" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const FileDiffSection = memo(function FileDiffSection({
  file,
  sectionRef,
}: {
  file: DiffFile;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  const parsedLines = useMemo(() => parseDiff(file.rawDiff), [file.rawDiff]);
  const config = FILE_STATUS_CONFIG[file.status];

  return (
    <div
      ref={sectionRef}
      data-file-path={file.path}
      className="overflow-hidden rounded-lg border border-border bg-background"
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-muted/80 px-3 py-1.5 backdrop-blur-sm">
        <FileCodeIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{file.path}</span>
        <span
          className={cn(
            'ml-1 inline-flex size-[16px] items-center justify-center rounded-sm border text-[9px] font-bold leading-none',
            config.className,
            'border-current/20',
          )}
        >
          {config.letter}
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {file.additions > 0 && <span className="text-green-600">+{file.additions}</span>}
          {file.additions > 0 && file.deletions > 0 && '  '}
          {file.deletions > 0 && <span className="text-red-500">-{file.deletions}</span>}
        </span>
      </div>
      <div className="overflow-x-auto">
        {parsedLines.map((line, index) => (
          <DiffRow key={index} line={line} />
        ))}
      </div>
    </div>
  );
});

export function CodeChangesFilesViewport({
  rawDiff,
  diffFiles,
  sidebarTop,
  mainTop,
  emptyMessage,
}: {
  rawDiff: AsyncState<string>;
  diffFiles: DiffFile[];
  sidebarTop?: ReactNode;
  mainTop?: ReactNode;
  emptyMessage: string;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [layoutVersion, setLayoutVersion] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileElementRefsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const fileRefCallbacksRef = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());
  const sizeCacheRef = useRef<Map<string, number>>(new Map());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    fileElementRefsRef.current.clear();
    fileRefCallbacksRef.current.clear();
    sizeCacheRef.current.clear();
    setScrollTop(0);
    setLayoutVersion(0);
    scrollContainerRef.current?.scrollTo(0, 0);
  }, [diffFiles]);

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
    () => diffFiles.map((file) => sizeCacheRef.current.get(file.path) ?? estimateFileHeight(file)),
    [diffFiles, layoutVersion],
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

  const scrollToFile = useCallback((path: string) => {
    const fileIndex = diffFiles.findIndex((file) => file.path === path);
    if (fileIndex === -1) {
      return;
    }

    scrollContainerRef.current?.scrollTo({
      top: Math.max(0, offsets[fileIndex]!),
      behavior: 'smooth',
    });
  }, [diffFiles, offsets]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-border">
        {sidebarTop}
        <FilesChangedList
          files={diffFiles}
          visibleFiles={visibleFiles}
          onSelectFile={scrollToFile}
        />
      </div>

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
                    <FileDiffSection file={file} sectionRef={getSectionRef(file.path)} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
