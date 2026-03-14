import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FileCodeIcon,
  GitCommitHorizontalIcon,
  LayersIcon,
} from 'lucide-react';

import type { PrCommit, PrDiffMetaResult } from '@/ipc/contracts';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/shadcn/components/ui/alert';
import { Button } from '@/shadcn/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { cn } from '@/shadcn/lib/utils';

import {
  DiffRow,
  parseDiff,
  parseDiffFiles,
  type DiffFile,
  type DiffFileStatus,
} from './code-diff-viewer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DiffSelection =
  | { type: 'commit'; index: number }
  | { type: 'all' };

type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: string };

type ReviewSyncState =
  | { status: 'idle' }
  | { status: 'syncing' }
  | { status: 'ready' }
  | { status: 'error'; error: string };

// ---------------------------------------------------------------------------
// File status styling
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sidebar: Commits list
// ---------------------------------------------------------------------------

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
        {commits.map((commit, i) => (
          <button
            key={commit.sha}
            type="button"
            onClick={() => onSelectCommit(i)}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent/50',
              selection.type === 'commit' && selection.index === i && 'bg-primary/10',
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

// ---------------------------------------------------------------------------
// Sidebar: Files changed list
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Commit carousel
// ---------------------------------------------------------------------------

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
      {/* Previous commit */}
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

      {/* Current commit */}
      <div className="flex min-w-0 flex-1 flex-col justify-center px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{commit.title || commit.shortSha}</span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{commit.shortSha}</span>
        </div>
        {commit.body && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{commit.body}</p>
        )}
      </div>

      {/* Next commit */}
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

// ---------------------------------------------------------------------------
// File diff section (memoized for performance)
// ---------------------------------------------------------------------------

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
    <div ref={sectionRef} data-file-path={file.path} className="overflow-hidden rounded-lg border border-border">
      {/* File header */}
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
      {/* Diff rows */}
      <div className="overflow-x-auto">
        {parsedLines.map((line, i) => (
          <DiffRow key={i} line={line} />
        ))}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function PrCodeChanges({
  repoPath,
  prNumber,
  metaState,
  syncState,
  onRetrySync,
}: {
  repoPath: string;
  prNumber: number;
  metaState: AsyncState<PrDiffMetaResult>;
  syncState: ReviewSyncState;
  onRetrySync: () => void;
}) {
  const [selection, setSelection] = useState<DiffSelection>({ type: 'commit', index: 0 });
  const [rawDiff, setRawDiff] = useState<AsyncState<string>>({ status: 'idle' });
  const [visibleFiles, setVisibleFiles] = useState<Set<string>>(new Set());

  const diffCacheRef = useRef<Map<string, string>>(new Map());
  const fileRefsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const diffScrollRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const snapshotKey = useMemo(() => {
    if (metaState.status !== 'ready') {
      return metaState.status;
    }

    if (metaState.data.status !== 'ready') {
      return `${metaState.data.status}:${metaState.data.reason}`;
    }

    return [
      metaState.data.baseBranch,
      metaState.data.headBranch,
      ...metaState.data.commits.map((commit) => commit.sha),
    ].join(':');
  }, [metaState]);

  useEffect(() => {
    diffCacheRef.current.clear();
    fileRefsRef.current.clear();
    setSelection({ type: 'commit', index: 0 });
    setRawDiff({ status: 'idle' });
    setVisibleFiles(new Set());
  }, [snapshotKey]);

  // ---- Derive cache key from selection ----
  const cacheKey = useMemo(() => {
    if (metaState.status !== 'ready' || metaState.data.status !== 'ready') return null;
    if (selection.type === 'all') return 'all';
    const commit = metaState.data.commits[selection.index];
    return commit?.sha ?? null;
  }, [metaState, selection]);

  // ---- Fetch diff when selection changes ----
  useEffect(() => {
    if (metaState.status !== 'ready' || metaState.data.status !== 'ready' || cacheKey === null) {
      return;
    }

    const cached = diffCacheRef.current.get(cacheKey);
    if (cached !== undefined) {
      setRawDiff({ status: 'ready', data: cached });
      return;
    }

    let cancelled = false;
    setRawDiff({ status: 'loading' });

    const fetchDiff =
      selection.type === 'all'
        ? window.electronAPI.getPrDiff(repoPath, prNumber)
        : window.electronAPI.getCommitDiff(repoPath, cacheKey);

    fetchDiff
      .then((data) => {
        if (cancelled) return;
        diffCacheRef.current.set(cacheKey, data);
        setRawDiff({ status: 'ready', data });
      })
      .catch((err) => {
        if (cancelled) return;
        setRawDiff({
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to load diff',
        });
      });

    return () => { cancelled = true; };
  }, [metaState, selection, cacheKey, repoPath, prNumber]);

  // ---- Parse diff files ----
  const diffFiles = useMemo(
    () => (rawDiff.status === 'ready' ? parseDiffFiles(rawDiff.data) : []),
    [rawDiff],
  );

  // ---- IntersectionObserver for visible file tracking ----
  useEffect(() => {
    observerRef.current?.disconnect();

    const scrollRoot = diffScrollRef.current;
    if (!scrollRoot) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setVisibleFiles((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const path = (entry.target as HTMLElement).dataset.filePath;
            if (!path) continue;
            if (entry.isIntersecting) {
              next.add(path);
            } else {
              next.delete(path);
            }
          }
          // Only update if changed
          if (next.size === prev.size && [...next].every((p) => prev.has(p))) {
            return prev;
          }
          return next;
        });
      },
      { root: scrollRoot, rootMargin: '0px', threshold: 0 },
    );

    observerRef.current = observer;

    for (const el of fileRefsRef.current.values()) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [diffFiles]);

  // ---- Scroll to file ----
  const scrollToFile = useCallback((path: string) => {
    const el = fileRefsRef.current.get(path);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // ---- File section ref callback ----
  const makeFileRef = useCallback(
    (path: string) => (el: HTMLDivElement | null) => {
      if (el) {
        fileRefsRef.current.set(path, el);
        observerRef.current?.observe(el);
      } else {
        const prev = fileRefsRef.current.get(path);
        if (prev) observerRef.current?.unobserve(prev);
        fileRefsRef.current.delete(path);
      }
    },
    [],
  );

  // ---- Selection handlers ----
  const handleSelectCommit = useCallback((index: number) => {
    setSelection({ type: 'commit', index });
    setVisibleFiles(new Set());
    diffScrollRef.current?.scrollTo(0, 0);
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelection({ type: 'all' });
    setVisibleFiles(new Set());
    diffScrollRef.current?.scrollTo(0, 0);
  }, []);

  // ---- Loading state ----
  if (metaState.status === 'idle' || metaState.status === 'loading') {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner className="size-4" />
          </EmptyMedia>
          <EmptyTitle>Checking local PR snapshot</EmptyTitle>
          <EmptyDescription>
            Review opens from local refs first, then syncs in the background.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (metaState.status === 'error') {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>Could not read local PR snapshot</EmptyTitle>
          <EmptyDescription>{metaState.error}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" variant="outline" size="sm" onClick={onRetrySync}>
            Retry sync
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (metaState.data.status === 'missing') {
    const isSyncing = syncState.status === 'syncing';

    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {isSyncing ? <Spinner className="size-4" /> : <LayersIcon className="size-4" />}
          </EmptyMedia>
          <EmptyTitle>
            {isSyncing ? 'Syncing local PR snapshot' : 'No local PR snapshot yet'}
          </EmptyTitle>
          <EmptyDescription>{metaState.data.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {syncState.status === 'error' ? (
            <>
              <p className="text-sm text-muted-foreground">{syncState.error}</p>
              <Button type="button" variant="outline" size="sm" onClick={onRetrySync}>
                Retry sync
              </Button>
            </>
          ) : null}
        </EmptyContent>
      </Empty>
    );
  }

  const { commits, baseBranch, headBranch } = metaState.data;

  if (commits.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">No commits found in this pull request.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      {syncState.status === 'syncing' && (
        <div className="shrink-0 px-4 pt-4">
          <Alert>
            <AlertTitle>Syncing latest PR refs</AlertTitle>
            <AlertDescription>
              Showing the local snapshot while the newest refs are fetched in the background.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {syncState.status === 'error' && (
        <div className="shrink-0 px-4 pt-4">
          <Alert>
            <AlertTitle>Background sync failed</AlertTitle>
            <AlertDescription>{syncState.error}</AlertDescription>
            <AlertAction>
              <Button type="button" variant="outline" size="sm" onClick={onRetrySync}>
                Retry sync
              </Button>
            </AlertAction>
          </Alert>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar */}
        <div className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-border">
          <CommitsList
            commits={commits}
            selection={selection}
            onSelectCommit={handleSelectCommit}
            onSelectAll={handleSelectAll}
          />
          <FilesChangedList
            files={diffFiles}
            visibleFiles={visibleFiles}
            onSelectFile={scrollToFile}
          />
        </div>

        {/* Right content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <CommitCarousel
            commits={commits}
            selection={selection}
            onSelectCommit={handleSelectCommit}
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
            <div ref={diffScrollRef} className="flex-1 overflow-y-auto">
              <div className="flex flex-col gap-4 p-4">
                {diffFiles.map((file) => (
                  <FileDiffSection
                    key={file.path}
                    file={file}
                    sectionRef={makeFileRef(file.path)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
