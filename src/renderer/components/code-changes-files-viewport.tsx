import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from 'react';

import { FileCodeIcon } from 'lucide-react';

import { DiffFileSection } from '@/renderer/components/diff-renderer';
import { TruncatedFilePath } from '@/renderer/components/truncated-file-path';
import { type DiffRenderFile } from '@/renderer/hooks/use-diff-render-files';
import { type AsyncState } from '@/renderer/hooks/use-pr-diff-data';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { cn } from '@/shadcn/lib/utils';

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

function estimateFileHeight(file: DiffRenderFile) {
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
  title = 'Files changed',
  files,
  visibleFiles,
  onSelectFile,
  actions,
  topContent,
  emptyMessage = 'No changed files.',
}: {
  title?: string;
  files: DiffRenderFile[];
  visibleFiles: Set<string>;
  onSelectFile: (path: string) => void;
  actions?: ReactNode;
  topContent?: ReactNode;
  emptyMessage?: string;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-foreground">
        <FileCodeIcon className="size-3.5 text-muted-foreground" />
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
      <div className="flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            {emptyMessage}
          </div>
        ) : files.map((file) => {
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
  sidebar?: ReactNode | ((props: CodeChangesSidebarRenderProps) => ReactNode);
  mainTop?: ReactNode;
  emptyMessage: string;
  onVisibleFilesChange?: (files: Set<string>) => void;
};

export const CodeChangesFilesViewport = forwardRef<CodeChangesViewportHandle, CodeChangesFilesViewportProps>(
  function CodeChangesFilesViewport({
    rawDiff,
    diffFiles,
    sidebar,
    mainTop,
    emptyMessage,
    onVisibleFilesChange,
  }, ref) {
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

  useEffect(() => {
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
                    <DiffFileSection file={file} sectionRef={getSectionRef(file.path)} />
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
