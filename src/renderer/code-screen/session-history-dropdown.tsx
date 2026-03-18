import { useEffect, useMemo, useState } from 'react';

import { HistoryIcon, LoaderCircleIcon } from 'lucide-react';

import { dayjs } from '@/lib/dayjs';
import type { CodexThreadSummary } from '@/ipc/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';
import { cn } from '@/shadcn/lib/utils';

export function SessionHistoryDropdown({
  cwd,
  currentThreadId,
}: {
  cwd: string;
  currentThreadId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<CodexThreadSummary[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setErrorMessage(null);

    void window.electronAPI
      .listCodexThreads({
        cwd,
        limit: 24,
      })
      .then((nextEntries) => {
        if (cancelled) {
          return;
        }

        setEntries(nextEntries);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        console.error('Failed to load Codex thread history:', error);
        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to load Codex sessions.',
        );
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [cwd, open]);

  const sortedEntries = useMemo(
    () => entries.toSorted((left, right) => right.updatedAt - left.updatedAt),
    [entries],
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={cn(
          'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        )}
        aria-label="Session history"
      >
        <HistoryIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        sideOffset={8}
        align="start"
        className="max-h-[24rem] w-[22rem] overflow-y-auto"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Session history</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {status === 'loading' ? (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
            <LoaderCircleIcon className="size-3 animate-spin" />
            Loading Codex sessions...
          </div>
        ) : null}
        {status === 'error' ? (
          <div className="px-3 py-3 text-xs text-destructive/80">
            {errorMessage ?? 'Failed to load Codex sessions.'}
          </div>
        ) : null}
        {status === 'ready' && sortedEntries.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            No Codex sessions for this repo yet.
          </div>
        ) : null}
        {status === 'ready' && sortedEntries.length > 0 ? (
          <div className="flex flex-col gap-1 p-1.5">
            {sortedEntries.map((entry) => {
              const title = entry.name?.trim() || entry.preview.trim() || 'Untitled session';
              const preview = entry.name?.trim()
                ? entry.preview.trim()
                : '';
              const isCurrent = currentThreadId === entry.id;

              return (
                <div
                  key={entry.id}
                  className="rounded-xl border border-border/70 bg-background/70 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {title}
                    </p>
                    {isCurrent ? (
                      <span className="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Current
                      </span>
                    ) : null}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {dayjs.unix(entry.updatedAt).fromNow(true)}
                    </span>
                  </div>
                  {preview ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {preview}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
