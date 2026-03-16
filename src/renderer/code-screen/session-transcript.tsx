import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  BotIcon,
  CheckIcon,
  CircleAlertIcon,
  GlobeIcon,
  HammerIcon,
  ImageIcon,
  LoaderCircleIcon,
  PlusIcon,
  SearchIcon,
  SquarePenIcon,
  TerminalIcon,
  WrenchIcon,
  ZapIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';

import type { CodexSessionState } from '@/renderer/code-screen/codex-session-state';
import {
  deriveSessionTimelineRows,
  estimateSessionTimelineRowHeight,
  type SessionTimelineRow,
  type SessionTimelineToolEntry,
} from '@/renderer/code-screen/session-timeline';
import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import { cn } from '@/shadcn/lib/utils';

const MAX_VISIBLE_TOOL_ENTRIES = 6;
const AUTO_SCROLL_THRESHOLD_PX = 48;
const ALWAYS_UNVIRTUALIZED_TAIL_ROWS = 6;

function toolEntryIcon(entry: SessionTimelineToolEntry) {
  if (entry.tone === 'error') {
    return CircleAlertIcon;
  }

  if (entry.itemType === 'command_execution') {
    return TerminalIcon;
  }

  if (entry.itemType === 'file_change') {
    return SquarePenIcon;
  }

  if (entry.itemType === 'web_search') {
    return SearchIcon;
  }

  if (entry.itemType === 'image_view') {
    return ImageIcon;
  }

  if (entry.itemType === 'mcp_tool_call') {
    return WrenchIcon;
  }

  if (entry.itemType === 'dynamic_tool_call') {
    return HammerIcon;
  }

  if (entry.itemType === 'collab_agent_tool_call') {
    return GlobeIcon;
  }

  return entry.status === 'completed' ? CheckIcon : ZapIcon;
}

function toolEntryIconClassName(entry: SessionTimelineToolEntry): string {
  if (entry.tone === 'error') {
    return 'text-destructive';
  }

  if (entry.status === 'running') {
    return 'text-primary';
  }

  return 'text-muted-foreground';
}

const AssistantMarkdown = memo(function AssistantMarkdown({
  text,
  isStreaming = false,
}: {
  text: string;
  isStreaming?: boolean;
}) {
  return (
    <div className="min-w-0 px-1">
      <div className="prose prose-sm max-w-none text-foreground prose-headings:font-medium prose-headings:text-foreground prose-p:text-foreground prose-p:leading-7 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-code:rounded-md prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-medium prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-pre:overflow-x-auto prose-pre:rounded-2xl prose-pre:border prose-pre:border-border/70 prose-pre:bg-card prose-pre:px-4 prose-pre:py-3 prose-pre:text-foreground dark:prose-invert">
        <ReactMarkdown
          components={{
            ul: ({ children, ...props }) => (
              <ul className="my-4 flex list-disc flex-col gap-1 pl-5" {...props}>
                {children}
              </ul>
            ),
            ol: ({ children, ...props }) => (
              <ol className="my-4 flex list-decimal flex-col gap-1 pl-5" {...props}>
                {children}
              </ol>
            ),
            blockquote: ({ children, ...props }) => (
              <blockquote
                className="border-l-2 border-border/70 pl-4 text-muted-foreground"
                {...props}
              >
                {children}
              </blockquote>
            ),
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
      {isStreaming ? (
        <div className="mt-2 flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
          <LoaderCircleIcon className="size-3 animate-spin" />
          Streaming response
        </div>
      ) : null}
    </div>
  );
});

const ToolEntryRow = memo(function ToolEntryRow({
  entry,
}: {
  entry: SessionTimelineToolEntry;
}) {
  const EntryIcon = toolEntryIcon(entry);

  return (
    <div className="flex items-start gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-background/70">
      <div
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/70',
          toolEntryIconClassName(entry),
        )}
      >
        <EntryIcon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{entry.label}</p>
          {entry.status === 'running' ? <Badge variant="secondary">Running</Badge> : null}
          {entry.tone === 'error' ? <Badge variant="destructive">Error</Badge> : null}
        </div>
        {entry.detail ? (
          <p className="truncate text-xs text-muted-foreground" title={entry.detail}>
            {entry.detail}
          </p>
        ) : null}
      </div>
    </div>
  );
});

function ToolGroupRow({ entries }: { entries: SessionTimelineToolEntry[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasOverflow = entries.length > MAX_VISIBLE_TOOL_ENTRIES;
  const visibleEntries =
    hasOverflow && !isExpanded ? entries.slice(-MAX_VISIBLE_TOOL_ENTRIES) : entries;
  const onlyToolEntries = entries.every((entry) => entry.tone === 'tool');

  return (
    <div className="px-1 pb-4">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/75 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{onlyToolEntries ? 'Tool calls' : 'Progress'}</Badge>
            <p className="text-xs text-muted-foreground">
              {entries.length} {entries.length === 1 ? 'action' : 'actions'}
            </p>
          </div>
          {hasOverflow ? (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => setIsExpanded((current) => !current)}
            >
              {isExpanded ? 'Show less' : `Show ${entries.length - visibleEntries.length} more`}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-col gap-1 p-2">
          {visibleEntries.map((entry) => (
            <ToolEntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
}

const UserMessageRow = memo(function UserMessageRow({
  text,
}: {
  text: string;
}) {
  return (
    <div className="flex justify-end px-1 pb-4">
      <div className="max-w-[78%] rounded-[1.35rem] rounded-br-md border border-primary/15 bg-primary px-4 py-3 text-sm leading-7 text-primary-foreground shadow-sm">
        <span className="whitespace-pre-wrap">{text}</span>
      </div>
    </div>
  );
});

const AssistantMessageRow = memo(function AssistantMessageRow({
  text,
  diff,
  isStreaming = false,
}: {
  text: string;
  diff?: NonNullable<CodexSessionState['messages'][number]['diff']> | null;
  isStreaming?: boolean;
}) {
  const totalAdditions = diff?.files.reduce((sum, file) => sum + file.additions, 0) ?? 0;
  const totalDeletions = diff?.files.reduce((sum, file) => sum + file.deletions, 0) ?? 0;
  const visibleFiles = diff?.files.slice(0, 4) ?? [];

  return (
    <div className="min-w-0 pb-4">
      <AssistantMarkdown text={text.trim().length > 0 ? text : '(empty response)'} isStreaming={isStreaming} />
      {diff && diff.files.length > 0 ? (
        <div className="mt-3 px-1">
          <div className="rounded-2xl border border-border/70 bg-card/75 p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Turn diff</Badge>
              <p className="text-xs text-muted-foreground">
                {diff.files.length} {diff.files.length === 1 ? 'file' : 'files'}
              </p>
              <p className="text-xs text-muted-foreground">
                +{totalAdditions} / -{totalDeletions}
              </p>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {visibleFiles.map((file) => (
                <div
                  key={`${file.status}:${file.path}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{file.path}</p>
                    <p className="text-muted-foreground">{file.status}</p>
                  </div>
                  <p className="shrink-0 text-muted-foreground">
                    +{file.additions} / -{file.deletions}
                  </p>
                </div>
              ))}
              {diff.files.length > visibleFiles.length ? (
                <p className="text-xs text-muted-foreground">
                  +{diff.files.length - visibleFiles.length} more files in this turn
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

const WorkingRow = memo(function WorkingRow() {
  return (
    <div className="flex items-center gap-2 px-2 pb-4 text-sm text-muted-foreground">
      <LoaderCircleIcon className="size-3.5 animate-spin" />
      Codex is working
    </div>
  );
});

function TimelineRowView({ row }: { row: SessionTimelineRow }) {
  if (row.kind === 'work') {
    return <ToolGroupRow entries={row.entries} />;
  }

  if (row.kind === 'working') {
    return <WorkingRow />;
  }

  if (row.kind === 'streaming-message') {
    return <AssistantMessageRow text={row.text} diff={null} isStreaming />;
  }

  if (row.message.role === 'user') {
    return <UserMessageRow text={row.message.text} />;
  }

  return <AssistantMessageRow text={row.message.text} diff={row.message.diff} />;
}

export const SessionTranscript = memo(function SessionTranscript({
  sessionState,
  targetLabel,
  onCreateSession,
}: {
  sessionState: CodexSessionState;
  targetLabel: string;
  onCreateSession: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRootRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const [timelineWidthPx, setTimelineWidthPx] = useState<number | null>(null);

  const rows = useMemo(
    () => deriveSessionTimelineRows(sessionState),
    [
      sessionState.currentTurnActivities,
      sessionState.messages,
      sessionState.status,
      sessionState.streamingAssistantText,
    ],
  );
  const hasConversation = rows.length > 0;

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom <= AUTO_SCROLL_THRESHOLD_PX;
  }, []);

  useLayoutEffect(() => {
    const element = timelineRootRef.current;

    if (!element) {
      return;
    }

    const updateWidth = (nextWidth: number) => {
      setTimelineWidthPx((currentWidth) => {
        if (currentWidth !== null && Math.abs(currentWidth - nextWidth) < 0.5) {
          return currentWidth;
        }

        return nextWidth;
      });
    };

    updateWidth(element.getBoundingClientRect().width);

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateWidth(element.getBoundingClientRect().width);
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [hasConversation]);

  const virtualizedRowCount = Math.max(rows.length - ALWAYS_UNVIRTUALIZED_TAIL_ROWS, 0);
  const rowVirtualizer = useVirtualizer({
    count: virtualizedRowCount,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => rows[index]?.id ?? index,
    estimateSize: (index) => estimateSessionTimelineRowHeight(rows[index]!, timelineWidthPx),
    overscan: 6,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const nonVirtualizedRows = rows.slice(virtualizedRowCount);

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer, rows, timelineWidthPx]);

  useEffect(() => {
    const element = scrollRef.current;

    if (!element || !shouldAutoScrollRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    rowVirtualizer,
    rows.length,
    sessionState.currentTurnActivities.length,
    sessionState.streamingAssistantText,
  ]);

  if (!hasConversation) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <Empty className="border-border bg-card/30">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BotIcon />
            </EmptyMedia>
            <EmptyTitle>Codex is ready for {targetLabel}</EmptyTitle>
            <EmptyDescription>
              Use the input below to inspect, edit, or compare code in this target.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" onClick={onCreateSession}>
              <PlusIcon data-icon="inline-start" />
              New session on current branch
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
    >
      <div ref={timelineRootRef} className="mx-auto w-full max-w-3xl min-w-0">
        {virtualizedRowCount > 0 ? (
          <div className="relative" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {virtualRows.map((virtualRow: VirtualItem) => {
              const row = rows[virtualRow.index];

              if (!row) {
                return null;
              }

              return (
                <div
                  key={`virtual-row:${row.id}`}
                  ref={rowVirtualizer.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <TimelineRowView row={row} />
                </div>
              );
            })}
          </div>
        ) : null}

        {nonVirtualizedRows.map((row) => (
          <div key={`tail-row:${row.id}`}>
            <TimelineRowView row={row} />
          </div>
        ))}
      </div>
    </div>
  );
});
