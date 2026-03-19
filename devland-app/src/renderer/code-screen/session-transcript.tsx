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
  ChevronDownIcon,
  CircleAlertIcon,
  GlobeIcon,
  HammerIcon,
  ImageIcon,
  LoaderCircleIcon,
  SearchIcon,
  SquarePenIcon,
  TerminalIcon,
  WrenchIcon,
  ZapIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';

import type { CodexSessionState } from '@/renderer/code-screen/codex-session-state';
import {
  deriveSessionTimelineRows,
  estimateSessionTimelineRowHeight,
  type SessionTimelineRow,
  type SessionTimelineToolEntry,
} from '@/renderer/code-screen/session-timeline';
import { Button } from '@/shadcn/components/ui/button';
import { cn } from '@/shadcn/lib/utils';

const MAX_COLLAPSED_TOOL_ENTRIES = 3;
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

const AssistantMarkdown = memo(function AssistantMarkdown({
  text,
  isStreaming = false,
}: {
  text: string;
  isStreaming?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="prose prose-sm max-w-none text-foreground prose-headings:font-medium prose-headings:text-foreground prose-p:text-foreground prose-p:leading-7 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-code:rounded-md prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-medium prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:border prose-pre:border-border/50 prose-pre:bg-card prose-pre:px-4 prose-pre:py-3 prose-pre:text-foreground dark:prose-invert">
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
    </div>
  );
});

const ToolEntryInline = memo(function ToolEntryInline({
  entry,
}: {
  entry: SessionTimelineToolEntry;
}) {
  const EntryIcon = toolEntryIcon(entry);
  const isRunning = entry.status === 'running';
  const isError = entry.tone === 'error';

  return (
    <div className="flex items-center gap-2 py-0.5">
      <EntryIcon
        className={cn(
          'size-3 shrink-0',
          isError
            ? 'text-destructive'
            : isRunning
              ? 'text-primary animate-pulse'
              : 'text-muted-foreground/60',
        )}
      />
      <span
        className={cn(
          'truncate text-xs',
          isError ? 'text-destructive' : 'text-muted-foreground/70',
        )}
      >
        {entry.label}
      </span>
      {entry.detail ? (
        <span className="truncate text-xs text-muted-foreground/40">{entry.detail}</span>
      ) : null}
    </div>
  );
});

function ToolGroupRow({ entries }: { entries: SessionTimelineToolEntry[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasOverflow = entries.length > MAX_COLLAPSED_TOOL_ENTRIES;
  const hiddenCount = entries.length - MAX_COLLAPSED_TOOL_ENTRIES;
  const previousEntries = hasOverflow ? entries.slice(0, hiddenCount) : [];
  const lastEntries = hasOverflow ? entries.slice(-MAX_COLLAPSED_TOOL_ENTRIES) : entries;

  return (
    <div className="py-1 pl-10">
      <div className="flex flex-col">
        {hasOverflow ? (
          <>
            <button
              type="button"
              onClick={() => setIsExpanded((current) => !current)}
              className="mb-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
            >
              <ChevronDownIcon
                className={cn('size-3 transition-transform', isExpanded && 'rotate-180')}
              />
              {isExpanded ? 'Show less' : `${hiddenCount} more`}
            </button>
            <AnimatePresence initial={false}>
              {isExpanded ? (
                <motion.div
                  key="hidden-entries"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.1, ease: 'easeInOut' }}
                  className="flex flex-col overflow-hidden"
                >
                  {previousEntries.map((entry) => (
                    <ToolEntryInline key={entry.id} entry={entry} />
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </>
        ) : null}
        {lastEntries.map((entry) => (
          <ToolEntryInline key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

const UserMessageRow = memo(function UserMessageRow({
  text,
  attachments,
}: {
  text: string;
  attachments: CodexSessionState['messages'][number]['attachments'];
}) {
  return (
    <div className="flex justify-end py-1.5">
      <div className="flex max-w-[72%] flex-col gap-3 rounded-2xl rounded-br-md bg-primary/90 px-3.5 py-2 text-[13px] leading-relaxed text-primary-foreground">
        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment, index) => (
              <div
                key={`${attachment.name}:${attachment.sizeBytes}:${index}`}
                className="overflow-hidden rounded-lg border border-primary-foreground/15 bg-primary-foreground/8"
              >
                {attachment.previewUrl ? (
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.name}
                    className="size-16 object-cover"
                  />
                ) : (
                  <div className="flex size-16 items-center justify-center px-2 text-center text-[10px] leading-tight text-primary-foreground/85">
                    {attachment.name}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : null}
        {text.trim().length > 0 ? (
          <span className="whitespace-pre-wrap">{text}</span>
        ) : null}
      </div>
    </div>
  );
});

const AssistantMessageRow = memo(function AssistantMessageRow({
  text,
  isStreaming = false,
}: {
  text: string;
  isStreaming?: boolean;
}) {
  return (
    <div className="flex gap-2.5 py-1.5">
      <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground/60 mt-1">
        <BotIcon className="size-3" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <AssistantMarkdown
          text={text.trim().length > 0 ? text : '(empty response)'}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
});

const WorkingRow = memo(function WorkingRow() {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground/60">
        <BotIcon className="size-3" />
      </div>
      <LoaderCircleIcon className="size-3 animate-spin text-muted-foreground/50" />
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

  if (row.message.role === 'user') {
    return <UserMessageRow text={row.message.text} attachments={row.message.attachments} />;
  }

  return (
    <AssistantMessageRow text={row.message.text} isStreaming={row.isStreaming} />
  );
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
      sessionState.currentTurnEntries,
      sessionState.messages,
      sessionState.transcriptEntries,
      sessionState.status,
    ],
  );
  const hasConversation = rows.length > 0;

  // Track tool entry count changes for auto-scroll (entries can be added to existing work rows
  // without changing rows.length)
  const lastRowFingerprint = useMemo(() => {
    const lastRow = rows[rows.length - 1];
    if (lastRow?.kind === 'work') {
      return `${rows.length}:${lastRow.entries.length}`;
    }
    return `${rows.length}`;
  }, [rows]);

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
    lastRowFingerprint,
    sessionState.currentTurnEntries.length,
  ]);

  if (!hasConversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
          <BotIcon className="size-5" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Ready for {targetLabel}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Send a message to start working on this target.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-1"
          onClick={onCreateSession}
        >
          New session
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="h-full overflow-y-auto overscroll-contain px-5 py-4"
    >
      <div ref={timelineRootRef} className="mx-auto w-full min-w-0 pb-4">
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
                  data-index={virtualRow.index}
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
