import { useEffect } from 'react';

import {
  GitCommitHorizontalIcon,
  XIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { PrCommit } from '@/ipc/contracts';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { RelativeTime } from '@/renderer/shared/ui/relative-time';
import { Button } from '@/shadcn/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import { cn } from '@/shadcn/lib/utils';

export function CodeChangesHistoryDrawer({
  open,
  commits,
  isLoading = false,
  isRefreshing = false,
  error = null,
  selectedCommitSha,
  onClose,
  onSelectCommit,
}: {
  open: boolean;
  commits: PrCommit[];
  isLoading?: boolean;
  isRefreshing?: boolean;
  error?: string | null;
  selectedCommitSha: string | null;
  onClose: () => void;
  onSelectCommit: (index: number) => void;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            key="history-overlay"
            type="button"
            aria-label="Close history drawer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="absolute inset-0 z-10 bg-background/35 backdrop-blur-[1px]"
            onClick={onClose}
          />

          <motion.aside
            key="history-drawer"
            role="dialog"
            aria-modal="false"
            aria-labelledby="code-changes-history-title"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.16 }}
            className="absolute inset-y-0 left-0 z-20 flex w-[22rem] max-w-[92%] flex-col border-r border-border bg-background shadow-2xl"
          >
            <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
              <GitCommitHorizontalIcon className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div
                  id="code-changes-history-title"
                  className="text-sm font-medium text-foreground"
                >
                  History
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>
                    {commits.length} {commits.length === 1 ? 'commit' : 'commits'}
                  </span>
                  {isRefreshing ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Spinner className="size-3" />
                        Updating
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
              <Button
                size="icon"
                type="button"
                variant="ghost"
                aria-label="Close history"
                onClick={onClose}
              >
                <XIcon />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {isLoading ? (
                <Empty className="m-3 border-border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Spinner className="size-4" />
                    </EmptyMedia>
                    <EmptyTitle>Loading history</EmptyTitle>
                    <EmptyDescription>
                      Fetching recent commits on this branch.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : error ? (
                <Empty className="m-3 border-border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <GitCommitHorizontalIcon />
                    </EmptyMedia>
                    <EmptyTitle>Could not load history</EmptyTitle>
                    <EmptyDescription>{error}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : commits.length === 0 ? (
                <Empty className="m-3 border-border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <GitCommitHorizontalIcon />
                    </EmptyMedia>
                    <EmptyTitle>No history yet</EmptyTitle>
                    <EmptyDescription>
                      This branch does not have any commits yet.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="flex flex-col p-2">
                  {commits.map((commit, index) => {
                    const isSelected = commit.sha === selectedCommitSha;

                    return (
                      <button
                        key={commit.sha}
                        type="button"
                        onClick={() => onSelectCommit(index)}
                        className={cn(
                          'flex flex-col gap-1 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/60',
                          isSelected && 'bg-primary/10',
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-foreground/40" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-foreground">
                              {commit.title || commit.shortSha}
                            </div>
                            {commit.body ? (
                              <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                {commit.body}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <div className="ml-[14px] flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="font-mono">{commit.shortSha}</span>
                          <span>{commit.authorName}</span>
                          <RelativeTime value={commit.authorDate} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
