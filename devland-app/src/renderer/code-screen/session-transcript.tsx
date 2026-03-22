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
  AlertCircleIcon,
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

import type { RepoSuggestedPrompt } from '@/extensions/contracts';
import type { ExternalEditorPreference } from '@/ipc/contracts';
import type { CodexSessionState } from '@/renderer/code-screen/codex-session-state';
import { DETACHED_WORKTREE_TARGET_TITLE } from '@/renderer/code-screen/worktree-session';
import {
  deriveSessionTimelineRows,
  estimateSessionTimelineRowHeight,
  type SessionTimelineRow,
  type SessionTimelineToolEntry,
} from '@/renderer/code-screen/session-timeline';
import { openRepoFileInExternalEditor } from '@/renderer/shared/lib/open-file-in-external-editor';
import { ProposedPlanCard } from '@/renderer/code-screen/proposed-plan-card';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
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
}: {
  text: string;
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
  onOpenFile,
}: {
  entry: SessionTimelineToolEntry;
  onOpenFile?: ((path: string) => void) | undefined;
}) {
  const EntryIcon = toolEntryIcon(entry);
  const isRunning = entry.status === 'running';
  const isError = entry.tone === 'error';
  const filePaths = entry.filePaths ?? [];
  const primaryFilePath = entry.filePath ?? filePaths[0] ?? null;
  const additionalFileCount = Math.max(filePaths.length - (primaryFilePath ? 1 : 0), 0);
  const showFileLink = entry.itemType === 'file_change' && primaryFilePath !== null;

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
      {showFileLink ? (
        <button
          type="button"
          className="max-w-[22rem] truncate rounded-sm font-mono text-xs text-primary transition-colors hover:text-foreground"
          onClick={() => onOpenFile?.(primaryFilePath)}
          title={primaryFilePath ?? undefined}
        >
          {primaryFilePath}
        </button>
      ) : null}
      {additionalFileCount > 0 ? (
        <span className="truncate text-xs text-muted-foreground/40">
          +{additionalFileCount} more
        </span>
      ) : null}
      {entry.detail ? (
        <span className="truncate text-xs text-muted-foreground/40">{entry.detail}</span>
      ) : null}
    </div>
  );
});

function ToolGroupRow({
  entries,
  onOpenFile,
}: {
  entries: SessionTimelineToolEntry[];
  onOpenFile?: ((path: string) => void) | undefined;
}) {
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
                    <ToolEntryInline key={entry.id} entry={entry} onOpenFile={onOpenFile} />
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </>
        ) : null}
        {lastEntries.map((entry) => (
          <ToolEntryInline key={entry.id} entry={entry} onOpenFile={onOpenFile} />
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
}: {
  text: string;
}) {
  return (
    <div className="flex gap-2.5 py-1.5">
      <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground/60 mt-1">
        <BotIcon className="size-3" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <AssistantMarkdown
          text={text.trim().length > 0 ? text : '(empty response)'}
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

function TimelineRowView({
  row,
  onImplementPlan,
  onOpenFile,
}: {
  row: SessionTimelineRow;
  onImplementPlan?: ((planMarkdown: string) => void) | undefined;
  onOpenFile?: ((path: string) => void) | undefined;
}) {
  if (row.kind === 'work') {
    return <ToolGroupRow entries={row.entries} onOpenFile={onOpenFile} />;
  }

  if (row.kind === 'working') {
    return <WorkingRow />;
  }

  if (row.kind === 'proposed-plan') {
    return <ProposedPlanRow row={row} onImplementPlan={onImplementPlan} />;
  }

  if (row.message.role === 'user') {
    return <UserMessageRow text={row.message.text} attachments={row.message.attachments} />;
  }

  return (
    <AssistantMessageRow text={row.message.text} />
  );
}

const ProposedPlanRow = memo(function ProposedPlanRow({
  row,
  onImplementPlan,
}: {
  row: Extract<SessionTimelineRow, { kind: 'proposed-plan' }>;
  onImplementPlan?: ((planMarkdown: string) => void) | undefined;
}) {
  return (
    <div className="flex gap-2.5 py-2">
      <div className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground/60">
        <BotIcon className="size-3" />
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-col gap-3">
          {row.before ? <AssistantMarkdown text={row.before} /> : null}

          <ProposedPlanCard
            planMarkdown={row.planMarkdown}
            {...(row.isLatest ? {} : { title: null })}
            canImplement={row.isLatest && onImplementPlan !== undefined}
            onImplement={row.isLatest ? () => onImplementPlan?.(row.planMarkdown) : undefined}
          />

          {row.after ? <AssistantMarkdown text={row.after} /> : null}
        </div>
      </div>
    </div>
  );
});

const DEFAULT_SUGGESTION_PROMPTS: RepoSuggestedPrompt[] = [
  { label: 'Code review branch ', prompt: 'Code review the changes on this branch against the base branch.' },
  { label: 'Summarize branch changes', prompt: 'Review the changes on this branch against the base branch and output a markdown summary of user-facing changes.' },
  { label: 'Address Github PR review', prompt: 'Use gh CLI to fetch open PR comments for this branch. Investigate the codebase and address the relevant code reviews.' },
  { label: 'Address Github CI test failures', prompt: 'Check the .github workflows. Use gh CLI to fetch the latest test workflow for the current branch and address the issues.' },
];

function EmptyState({
  targetLabel,
  onSendSuggestion,
  suggestedPrompts,
}: {
  targetLabel: string;
  onSendSuggestion: ((prompt: string) => void) | undefined;
  suggestedPrompts?: RepoSuggestedPrompt[] | null | undefined;
}) {
  const resolvedTargetLabel =
    targetLabel === DETACHED_WORKTREE_TARGET_TITLE
      ? 'Branch will be created after the first message'
      : targetLabel;
  const resolvedSuggestedPrompts =
    suggestedPrompts === null
      ? []
      : suggestedPrompts ?? DEFAULT_SUGGESTION_PROMPTS;

  return (
    <div className="flex h-full flex-col items-center px-8">
      <div className="flex flex-1 max-w-md flex-col items-center justify-center gap-6">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="text-center"
        >
          <p className="mb-1.5 text-xs font-medium tracking-widest uppercase text-muted-foreground/50">
            Branch
          </p>
          <h2 className="display-face text-2xl text-foreground/90">
            {resolvedTargetLabel}
          </h2>
        </motion.div>

        {onSendSuggestion !== undefined ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.15, ease: 'easeOut' }}
            className="flex flex-wrap justify-center gap-2"
          >
            {resolvedSuggestedPrompts.map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                onClick={() => onSendSuggestion(suggestion.prompt)}
                className="rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground transition-all hover:border-primary/30 hover:bg-muted/60 hover:text-foreground"
              >
                {suggestion.label}
              </button>
            ))}
          </motion.div>
        ) : null}

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3, ease: 'easeOut' }}
          className="text-[11px] text-muted-foreground/40"
        >
          <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 font-sans text-[10px]">⌘</kbd>
          {' '}
          <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 font-sans text-[10px]">N</kbd>
          {' '}
          <span>for a new session</span>
        </motion.p>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3, ease: 'easeOut' }}
        className="shrink-0 pb-3 text-[11px] text-muted-foreground/40"
      >
        <code className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 text-[10px]">@file</code>
        {' '}to search this project
        {' · '}
        <code className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 text-[10px]">@/file</code>
        {' '}to search all projects
      </motion.p>
    </div>
  );
}

export const SessionTranscript = memo(function SessionTranscript({
  sessionState,
  repoPath,
  targetLabel,
  onSendSuggestion,
  onImplementPlan,
  suggestedPrompts,
  externalEditorPreference,
  onExternalEditorPreferenceChange,
  onRequestConfigureExternalEditor,
}: {
  sessionState: CodexSessionState;
  repoPath: string;
  targetLabel: string;
  onSendSuggestion?: (prompt: string) => void;
  onImplementPlan?: (planMarkdown: string) => void;
  suggestedPrompts?: RepoSuggestedPrompt[] | null | undefined;
  externalEditorPreference: ExternalEditorPreference | null;
  onExternalEditorPreferenceChange?: ((preference: ExternalEditorPreference) => void) | undefined;
  onRequestConfigureExternalEditor?: (() => void) | undefined;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRootRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const [timelineWidthPx, setTimelineWidthPx] = useState<number | null>(null);
  const [openFileError, setOpenFileError] = useState<string | null>(null);

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

  const handleOpenFile = useCallback(async (path: string) => {
    try {
      await openRepoFileInExternalEditor({
        repoPath,
        relativeFilePath: path,
        externalEditorPreference,
        onExternalEditorPreferenceChange,
        onRequestConfigureExternalEditor,
      });
      setOpenFileError(null);
    } catch (error) {
      setOpenFileError(
        error instanceof Error ? error.message : 'Could not open that file.',
      );
    }
  }, [
    externalEditorPreference,
    onExternalEditorPreferenceChange,
    onRequestConfigureExternalEditor,
    repoPath,
  ]);

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
      <EmptyState
        targetLabel={targetLabel}
        onSendSuggestion={onSendSuggestion}
        suggestedPrompts={suggestedPrompts}
      />
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="h-full overflow-y-auto overscroll-contain px-5 py-4"
    >
      <div ref={timelineRootRef} className="mx-auto w-full min-w-0 pb-4">
        {openFileError ? (
          <div className="mb-4">
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Could not open file</AlertTitle>
              <AlertDescription>{openFileError}</AlertDescription>
            </Alert>
          </div>
        ) : null}
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
              <TimelineRowView
                row={row}
                onImplementPlan={onImplementPlan}
                onOpenFile={handleOpenFile}
              />
            </div>
          );
        })}
          </div>
        ) : null}

        {nonVirtualizedRows.map((row) => (
          <div key={`tail-row:${row.id}`}>
            <TimelineRowView
              row={row}
              onImplementPlan={onImplementPlan}
              onOpenFile={handleOpenFile}
            />
          </div>
        ))}
      </div>
    </div>
  );
});
