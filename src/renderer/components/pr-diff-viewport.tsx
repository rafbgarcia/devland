import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from 'react';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FileCodeIcon,
  GitCommitHorizontalIcon,
  LayersIcon,
} from 'lucide-react';

import type { PrCommit } from '@/ipc/contracts';
import { DiffRow } from '@/renderer/components/code-diff-viewer';
import { parseDiff, type DiffFile, type DiffFileStatus } from '@/renderer/lib/code-diff';
import { type AsyncState, type DiffSelection } from '@/renderer/hooks/use-pr-diff-data';
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

function CommitsList({
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

function FilesChangedList({
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
          const fileName = file.path.split('/').pop() ?? file.path;
          const directory = file.path.includes('/')
            ? file.path.slice(0, file.path.lastIndexOf('/') + 1)
            : '';

          return (
            <button
              key={file.path}
              type="button"
              onClick={() => onSelectFile(file.path)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-[5px] text-left text-xs transition-colors hover:bg-accent/50',
                isVisible && 'bg-primary/10',
              )}
            >
              <span className={cn('size-1.5 shrink-0 rounded-full', config.dotClassName)} />
              <span className="min-w-0 flex-1 truncate">
                {directory ? (
                  <span className="text-muted-foreground">{directory}</span>
                ) : null}
                <span className="font-bold">{fileName}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
          {file.additions > 0 && (
            <span className="text-green-600">+{file.additions}</span>
          )}
          {file.additions > 0 && file.deletions > 0 && '  '}
          {file.deletions > 0 && (
            <span className="text-red-500">-{file.deletions}</span>
          )}
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
  diffFiles: DiffFile[];
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
        <CommitsList
          commits={commits}
          selection={selection}
          onSelectCommit={onSelectCommit}
          onSelectAll={onSelectAll}
        />
        <FilesChangedList
          files={diffFiles}
          visibleFiles={visibleFiles}
          onSelectFile={scrollToFile}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <CommitCarousel
          commits={commits}
          selection={selection}
          onSelectCommit={onSelectCommit}
          baseBranch={baseBranch}
          headBranch={headBranch}
        />

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
            <p className="text-sm text-muted-foreground">No file changes in this commit.</p>
          </div>
        )}

        {rawDiff.status === 'ready' && diffFiles.length > 0 && (
          <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
            <div
              className="relative"
              style={{ height: totalHeight + VIEWPORT_INSET_PX * 2 }}
            >
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
