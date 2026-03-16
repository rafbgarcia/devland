import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';

import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileCodeIcon,
  GitBranchPlusIcon,
  HistoryIcon,
  LoaderCircleIcon,
  PlusIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SquarePenIcon,
  TerminalIcon,
  XIcon,
  ZapIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Collapsible } from '@base-ui/react/collapsible';

import { CodeChanges } from '@/renderer/components/code-changes';
import { useCodeTargets } from '@/renderer/hooks/use-code-targets';
import {
  useCodexSessionActions,
  useCodexSessionState,
  type CodexChatMessage,
  type CodexSessionActivity,
  type CodexSessionState,
} from '@/renderer/hooks/use-codex-sessions';
import {
  useGitDefaultBranch,
  useGitStateWatch,
  useGitStatus,
} from '@/renderer/hooks/use-git';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Button } from '@/shadcn/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuCheckboxItemIndicator,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRadioItemIndicator,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import { Tabs, TabsList, TabsTrigger } from '@/shadcn/components/ui/tabs';
import { cn } from '@/shadcn/lib/utils';

const TEMPORARY_WORKTREE_BRANCH_PATTERN = /^codex\/[0-9a-f]{8}$/;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 500;
const SIDEBAR_DEFAULT_WIDTH = 280;
const MAX_VISIBLE_ACTIVITIES = 4;

type ActiveLayer = 'files' | 'codex';

// ---------------------------------------------------------------------------
// Activity helpers
// ---------------------------------------------------------------------------

function activityIcon(activity: CodexSessionActivity) {
  if (activity.tone === 'error') return <XIcon className="size-3 text-rose-400/70" />;
  if (activity.tone === 'tool') {
    const label = activity.label.toLowerCase();
    if (label.includes('command') || label.includes('exec') || label.includes('bash'))
      return <TerminalIcon className="size-3 text-muted-foreground/70" />;
    if (label.includes('file') || label.includes('write') || label.includes('edit') || label.includes('read'))
      return <SquarePenIcon className="size-3 text-muted-foreground/70" />;
    return <ZapIcon className="size-3 text-amber-400/70" />;
  }
  return <CheckIcon className="size-3 text-muted-foreground/50" />;
}

// ---------------------------------------------------------------------------
// ActivityGroup – t3code-inspired collapsible tool call display
// ---------------------------------------------------------------------------

function ActivityGroup({ activities }: { activities: CodexSessionActivity[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasOverflow = activities.length > MAX_VISIBLE_ACTIVITIES;
  const visibleActivities = hasOverflow && !isExpanded
    ? activities.slice(-MAX_VISIBLE_ACTIVITIES)
    : activities;

  return (
    <div className="rounded-lg border border-border/40 bg-card/30">
      <Collapsible.Root open={isExpanded} onOpenChange={setIsExpanded}>
        <Collapsible.Trigger className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <ZapIcon className="size-3 shrink-0 text-amber-400/70" />
          <span className="font-medium">
            {activities.length} tool {activities.length === 1 ? 'call' : 'calls'}
          </span>
          <ChevronRightIcon
            className={cn(
              'ml-auto size-3 transition-transform duration-200',
              isExpanded && 'rotate-90',
            )}
          />
        </Collapsible.Trigger>
        <Collapsible.Panel>
          <div className="flex flex-col gap-px border-t border-border/30 px-1 py-1">
            {hasOverflow && !isExpanded ? null : null}
            {visibleActivities.map((activity) => (
              <div
                key={activity.id}
                className="group flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/30"
              >
                <span className="mt-0.5 shrink-0">{activityIcon(activity)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-medium text-muted-foreground/80">
                    {activity.label}
                  </div>
                  {activity.detail ? (
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground/50">
                      {activity.detail}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {hasOverflow && !isExpanded ? (
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className="px-2 py-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground"
              >
                +{activities.length - MAX_VISIBLE_ACTIVITIES} more
              </button>
            ) : null}
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageBubble – chat-style message rendering
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: CodexChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <div className={cn('flex max-w-[85%] flex-col gap-2', isUser ? 'items-end' : 'items-start')}>
        {/* Activities (tool calls) — shown before assistant text */}
        {!isUser && message.activities.length > 0 ? (
          <ActivityGroup activities={message.activities} />
        ) : null}

        {/* Message text */}
        {message.text.trim().length > 0 ? (
          <div
            className={cn(
              'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
              isUser
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-foreground',
            )}
          >
            <span className="whitespace-pre-wrap">{message.text}</span>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// StreamingMessage – in-progress assistant response
// ---------------------------------------------------------------------------

function StreamingMessage({
  text,
  activities,
}: {
  text: string;
  activities: CodexSessionActivity[];
}) {
  const hasText = text.trim().length > 0;
  const hasActivities = activities.length > 0;

  if (!hasText && !hasActivities) return null;

  return (
    <motion.div
      className="flex justify-start"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex max-w-[85%] flex-col items-start gap-2">
        {hasActivities ? <ActivityGroup activities={activities} /> : null}
        {hasText ? (
          <div className="rounded-2xl bg-muted/50 px-4 py-2.5 text-sm leading-relaxed text-foreground">
            <span className="whitespace-pre-wrap">{text}</span>
            <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-foreground/40" />
          </div>
        ) : (
          <div className="flex items-center gap-2 px-1 py-1">
            <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground/60" />
            <span className="text-xs text-muted-foreground/60">Thinking...</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// CodexSessionOutput
// ---------------------------------------------------------------------------

function CodexSessionOutput({
  sessionState,
  targetLabel,
  onCreateSession,
  scrollRef,
}: {
  sessionState: CodexSessionState;
  targetLabel: string;
  onCreateSession: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const hasConversation =
    sessionState.messages.length > 0 ||
    sessionState.streamingAssistantText.trim().length > 0 ||
    sessionState.currentTurnActivities.length > 0;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [
    sessionState.messages.length,
    sessionState.streamingAssistantText,
    sessionState.currentTurnActivities.length,
    scrollRef,
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
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-3">
        <AnimatePresence mode="popLayout">
          {sessionState.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </AnimatePresence>

        {sessionState.status === 'running' ? (
          <StreamingMessage
            text={sessionState.streamingAssistantText}
            activities={sessionState.currentTurnActivities}
          />
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings dropdown (model + effort + full access)
// ---------------------------------------------------------------------------

function SettingsDropdown() {
  const [model, setModel] = useState('gpt-5.4');
  const [effort, setEffort] = useState('high');
  const [fullAccess, setFullAccess] = useState(false);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <SettingsIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" sideOffset={8} align="start">
        <DropdownMenuLabel>Select model</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={model} onValueChange={setModel}>
          {[
            { value: 'gpt-5.4', label: 'GPT-5.4' },
            { value: 'gpt-5.3-codex', label: 'GPT-5.3-Codex' },
            { value: 'gpt-5.3-codex-spark', label: 'GPT-5.3-Codex-Spark' },
            { value: 'gpt-5.2-codex', label: 'GPT-5.2-Codex' },
            { value: 'gpt-5.2', label: 'GPT-5.2' },
          ].map((m) => (
            <DropdownMenuRadioItem key={m.value} value={m.value} closeOnClick={false}>
              <ZapIcon className="size-3.5 text-amber-400" />
              {m.label}
              <DropdownMenuRadioItemIndicator className="ml-auto">
                <CheckIcon className="size-3.5" />
              </DropdownMenuRadioItemIndicator>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Select reasoning</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={effort} onValueChange={setEffort}>
          {['Low', 'Medium', 'High', 'Extra High'].map((level) => (
            <DropdownMenuRadioItem key={level} value={level.toLowerCase()} closeOnClick={false}>
              {level}
              <DropdownMenuRadioItemIndicator className="ml-auto">
                <CheckIcon className="size-3.5" />
              </DropdownMenuRadioItemIndicator>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuCheckboxItem
          checked={fullAccess}
          onCheckedChange={setFullAccess}
          closeOnClick={false}
        >
          <ShieldCheckIcon className="size-3.5" />
          Full access
          <DropdownMenuCheckboxItemIndicator className="ml-auto">
            <CheckIcon className="size-3.5" />
          </DropdownMenuCheckboxItemIndicator>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// ResizableHandle
// ---------------------------------------------------------------------------

function ResizableHandle({
  onResize,
  onResizeStart,
}: {
  onResize: (deltaX: number) => void;
  onResizeStart?: () => void;
}) {
  const handleMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault();
      onResizeStart?.();
      const startX = e.clientX;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        onResize(moveEvent.clientX - startX);
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [onResize, onResizeStart],
  );

  return (
    <div
      onMouseDown={handleMouseDown}
      className="group relative z-10 w-0 cursor-col-resize"
    >
      <div className="absolute inset-y-0 -left-px w-[3px] bg-transparent transition-colors group-hover:bg-primary/30 group-active:bg-primary/50" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// LayerToggle
// ---------------------------------------------------------------------------

function LayerToggle({
  activeLayer,
  onChangeLayer,
}: {
  activeLayer: ActiveLayer;
  onChangeLayer: (layer: ActiveLayer) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 border-b border-border bg-muted/30 px-3 py-1.5">
      <button
        type="button"
        onClick={() => onChangeLayer('files')}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
          activeLayer === 'files'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <FileCodeIcon className="size-3" />
        Changes
      </button>
      <button
        type="button"
        onClick={() => onChangeLayer('codex')}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
          activeLayer === 'codex'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <BotIcon className="size-3" />
        Codex
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layer (animated)
// ---------------------------------------------------------------------------

function Layer({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col"
      initial={false}
      animate={{
        opacity: active ? 1 : 0,
        y: active ? 0 : 6,
        scale: active ? 1 : 0.99,
      }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={{ pointerEvents: active ? 'auto' : 'none', zIndex: active ? 2 : 1 }}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// CodeWorkspaceView
// ---------------------------------------------------------------------------

export function CodeWorkspaceView({
  repoId,
  repoPath,
}: {
  repoId: string;
  repoPath: string;
}) {
  const [prompt, setPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, Record<string, string>>>({});
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>('codex');
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const sidebarWidthAtDragStart = useRef(SIDEBAR_DEFAULT_WIDTH);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    targets,
    activeTarget,
    activeTargetId,
    setActiveTarget,
    addCurrentBranchSession,
    addWorktreeTarget,
    removeTarget,
    updateTarget,
  } = useCodeTargets(repoId, repoPath);
  const sessionState = useCodexSessionState(activeTarget.id);
  const {
    sendPrompt,
    interruptSession,
    stopSession,
    respondToApproval,
    respondToUserInput,
  } = useCodexSessionActions();
  const rootStatusState = useGitStatus(repoPath);
  const defaultBranchState = useGitDefaultBranch(activeTarget.cwd);
  const statusState = useGitStatus(activeTarget.cwd);

  const activeBranch = statusState.data?.branch ?? 'HEAD';
  const rootBranch = rootStatusState.data?.branch ?? 'HEAD';
  const activePendingApproval = sessionState.pendingApprovals[0] ?? null;
  const activePendingUserInput = sessionState.pendingUserInputs[0] ?? null;
  const activeDraftAnswers =
    activePendingUserInput === null
      ? {}
      : (draftAnswers[activePendingUserInput.requestId] ?? {});

  useGitStateWatch([repoPath, activeTarget.cwd], () => {
    void Promise.all([
      rootStatusState.refetch(),
      statusState.refetch(),
      defaultBranchState.refetch(),
    ]).catch((error) => {
      console.error('Failed to refresh Git state:', error);
    });
  });

  const targetLabels = useMemo(
    () =>
      Object.fromEntries(
        targets.map((target) => {
          if (target.kind === 'root') {
            return [target.id, rootBranch];
          }

          if (target.kind === 'session') {
            return [target.id, `${target.title} · ${rootBranch}`];
          }

          return [target.id, target.title];
        }),
      ),
    [rootBranch, targets],
  );

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt || isSending || sessionState.status === 'running') {
      return;
    }

    setIsSending(true);
    setPrompt('');

    try {
      if (
        activeTarget.kind === 'worktree' &&
        sessionState.messages.length === 0 &&
        TEMPORARY_WORKTREE_BRANCH_PATTERN.test(activeTarget.title)
      ) {
        const promotion = await window.electronAPI.promoteGitWorktreeBranch(
          activeTarget.cwd,
          activeTarget.title,
          trimmedPrompt,
        );

        if (promotion.branch !== activeTarget.title) {
          updateTarget(activeTarget.id, (target) => ({
            ...target,
            title: promotion.branch,
          }));
          await Promise.all([
            rootStatusState.refetch(),
            statusState.refetch(),
            defaultBranchState.refetch(),
          ]);
        }
      }

      await sendPrompt(activeTarget.id, activeTarget.cwd, trimmedPrompt);
    } catch (error) {
      setPrompt(trimmedPrompt);
      console.error('Failed to send prompt:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const handleCreateCurrentBranchSession = () => {
    addCurrentBranchSession();
  };

  const handleCreateWorktree = async () => {
    setIsCreatingWorktree(true);

    try {
      const result = await window.electronAPI.createGitWorktree(repoPath, activeBranch);
      addWorktreeTarget(result.cwd, result.branch);
    } catch (error) {
      console.error('Failed to create worktree:', error);
    } finally {
      setIsCreatingWorktree(false);
    }
  };

  const handleCloseActiveTarget = async () => {
    if (activeTarget.kind === 'root') {
      return;
    }

    await stopSession(activeTarget.id);
    removeTarget(activeTarget.id);
  };

  const handleSidebarResize = useCallback((deltaX: number) => {
    setSidebarWidth(
      Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, sidebarWidthAtDragStart.current + deltaX)),
    );
  }, []);

  const handleSubmitDiffComment = useCallback(async (
    anchor: {
      path: string;
      side: 'old' | 'new';
      startLine: number;
      endLine: number;
      excerpt: string[];
    },
    body: string,
  ) => {
    const payload = JSON.stringify(
      {
        kind: 'diff-comment',
        path: anchor.path,
        side: anchor.side,
        startLine: anchor.startLine,
        endLine: anchor.endLine,
        excerpt: anchor.excerpt,
      },
      null,
      2,
    );

    await sendPrompt(
      activeTarget.id,
      activeTarget.cwd,
      `Process this anchored diff comment.\n\nContext:\n\`\`\`json\n${payload}\n\`\`\`\n\nUser comment:\n${body}`,
    );
    setActiveLayer('codex');
  }, [activeTarget.cwd, activeTarget.id, sendPrompt]);

  const isRunning = sessionState.status === 'running';
  const isInputDisabled = isRunning || isSending;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Tabs header */}
      <Tabs className="gap-0" value={activeTargetId} onValueChange={setActiveTarget}>
        <div className="border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1">
              <TabsList variant="line" className="min-w-0 bg-transparent p-0">
                {targets.map((target) => (
                  <TabsTrigger
                    key={target.id}
                    value={target.id}
                    className="max-w-[18rem] truncate px-3"
                  >
                    {targetLabels[target.id] ?? target.title}
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button
                size="icon"
                type="button"
                variant="ghost"
                className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={handleCreateCurrentBranchSession}
                aria-label="New session on current branch"
              >
                <PlusIcon className="size-3.5" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeTarget.kind !== 'root' ? (
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={handleCloseActiveTarget}
                >
                  <XIcon data-icon="inline-start" />
                  Close target
                </Button>
              ) : null}
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={handleCreateWorktree}
                disabled={isCreatingWorktree}
              >
                {isCreatingWorktree ? (
                  <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
                ) : (
                  <GitBranchPlusIcon data-icon="inline-start" />
                )}
                New worktree from {activeBranch}
              </Button>
            </div>
          </div>
        </div>
      </Tabs>

      {/* Main content: sidebar + center */}
      <div className="flex min-h-0 flex-1">
        {defaultBranchState.status === 'ready' && statusState.status === 'ready' ? (
          <CodeChanges
            repoPath={activeTarget.cwd}
            baseBranchName={defaultBranchState.data}
            branchName={statusState.data.branch}
            headRevision={statusState.data.headRevision}
            workingTreeFiles={statusState.data.files}
            onFileSelect={() => setActiveLayer('files')}
            onSubmitDiffComment={(anchor, body) => handleSubmitDiffComment(anchor, body)}
          >
            {({ sidebar, viewport, historyDrawer }) => (
              <>
                {/* Resizable sidebar */}
                <div
                  className="flex shrink-0 flex-col overflow-hidden border-r border-border"
                  style={{ width: sidebarWidth }}
                >
                  {sidebar}
                </div>
                <ResizableHandle onResizeStart={() => { sidebarWidthAtDragStart.current = sidebarWidth; }} onResize={handleSidebarResize} />

                {/* Center: layers + input */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <LayerToggle activeLayer={activeLayer} onChangeLayer={setActiveLayer} />

                  {/* Layered content */}
                  <div className="relative min-h-0 flex-1">
                    <Layer active={activeLayer === 'files'}>
                      {viewport}
                    </Layer>
                    <Layer active={activeLayer === 'codex'}>
                      <CodexSessionOutput
                        sessionState={sessionState}
                        targetLabel={targetLabels[activeTarget.id] ?? activeTarget.title}
                        onCreateSession={handleCreateCurrentBranchSession}
                        scrollRef={scrollRef}
                      />
                    </Layer>
                  </div>

                  {/* Bottom area — Discord-style input */}
                  <div
                    className="border-t border-border px-4 pb-3 pt-2"
                    onFocus={() => setActiveLayer('codex')}
                  >
                    <div className="w-full">
                      {/* Approval / error / user-input alerts */}
                      {sessionState.error ? (
                        <div className="mb-2">
                          <Alert variant="destructive">
                            <AlertTitle>Codex session error</AlertTitle>
                            <AlertDescription>{sessionState.error}</AlertDescription>
                          </Alert>
                        </div>
                      ) : null}

                      {activePendingApproval ? (
                        <div className="mb-2">
                          <Alert>
                            <AlertTitle>{activePendingApproval.title}</AlertTitle>
                            <AlertDescription>
                              {activePendingApproval.command ??
                                activePendingApproval.detail ??
                                'Codex requested approval to continue.'}
                            </AlertDescription>
                            <div className="mt-3 flex gap-2">
                              <Button
                                size="sm"
                                type="button"
                                onClick={() =>
                                  void respondToApproval(
                                    activeTarget.id,
                                    activePendingApproval.requestId,
                                    'accept',
                                  )
                                }
                              >
                                Accept once
                              </Button>
                              <Button
                                size="sm"
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  void respondToApproval(
                                    activeTarget.id,
                                    activePendingApproval.requestId,
                                    'acceptForSession',
                                  )
                                }
                              >
                                Accept for session
                              </Button>
                              <Button
                                size="sm"
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  void respondToApproval(
                                    activeTarget.id,
                                    activePendingApproval.requestId,
                                    'decline',
                                  )
                                }
                              >
                                Decline
                              </Button>
                            </div>
                          </Alert>
                        </div>
                      ) : null}

                      {activePendingUserInput ? (
                        <div className="mb-2">
                          <Alert>
                            <AlertTitle>User input requested</AlertTitle>
                            <AlertDescription>
                              Codex needs a structured answer before it can continue.
                            </AlertDescription>
                            <div className="mt-3 flex flex-col gap-3">
                              {activePendingUserInput.questions.map((question) => (
                                <div key={question.id} className="flex flex-col gap-2">
                                  <div className="text-sm font-medium">{question.question}</div>
                                  <div className="flex flex-wrap gap-2">
                                    {question.options.map((option) => {
                                      const isSelected =
                                        activeDraftAnswers[question.id] === option.label;

                                      return (
                                        <Button
                                          key={option.label}
                                          size="sm"
                                          type="button"
                                          variant={isSelected ? 'default' : 'outline'}
                                          onClick={() =>
                                            setDraftAnswers((current) => ({
                                              ...current,
                                              [activePendingUserInput.requestId]: {
                                                ...(current[activePendingUserInput.requestId] ?? {}),
                                                [question.id]: option.label,
                                              },
                                            }))
                                          }
                                        >
                                          {option.label}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  type="button"
                                  disabled={
                                    activePendingUserInput.questions.some(
                                      (question) => !activeDraftAnswers[question.id],
                                    )
                                  }
                                  onClick={() =>
                                    void respondToUserInput(
                                      activeTarget.id,
                                      activePendingUserInput.requestId,
                                      activeDraftAnswers,
                                    )
                                  }
                                >
                                  Submit answers
                                </Button>
                              </div>
                            </div>
                          </Alert>
                        </div>
                      ) : null}

                      {/* Input bar */}
                      <form
                        className="flex items-end gap-1 rounded-xl border border-border bg-muted/30 px-1.5 py-1.5 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20"
                        onSubmit={handleSubmit}
                      >
                        {/* Left icons */}
                        <div className="flex shrink-0 items-center gap-0.5 pb-0.5">
                          <button
                            type="button"
                            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Session history"
                          >
                            <HistoryIcon className="size-4" />
                          </button>
                          <SettingsDropdown />
                        </div>

                        {/* Textarea */}
                        <textarea
                          ref={textareaRef}
                          className="max-h-32 min-h-[2rem] flex-1 resize-none border-0 bg-transparent px-1 py-1 text-sm leading-normal text-foreground outline-none placeholder:text-muted-foreground/60"
                          placeholder={`Message Codex about ${targetLabels[activeTarget.id] ?? activeTarget.title}`}
                          value={prompt}
                          onChange={(event) => setPrompt(event.target.value)}
                          onKeyDown={handleKeyDown}
                          disabled={isInputDisabled}
                          rows={1}
                          style={{ fieldSizing: 'content' } as React.CSSProperties}
                        />

                        {/* Stop button (only when running) */}
                        {isRunning ? (
                          <div className="shrink-0 pb-0.5">
                            <button
                              type="button"
                              onClick={() => void interruptSession(activeTarget.id)}
                              className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              aria-label="Stop"
                            >
                              <XIcon className="size-4" />
                            </button>
                          </div>
                        ) : null}
                      </form>

                      {/* Status text */}
                      <div className="mt-1 px-1 text-[10px] text-muted-foreground/50">
                        {isRunning
                          ? 'Codex is working...'
                          : `↵ to send · shift+↵ for newline`}
                      </div>
                    </div>
                  </div>
                </div>

                {historyDrawer}
              </>
            )}
          </CodeChanges>
        ) : defaultBranchState.status === 'error' ? (
          <div className="flex h-full flex-1 items-center justify-center px-6">
            <p className="text-sm text-muted-foreground">{defaultBranchState.error}</p>
          </div>
        ) : statusState.status === 'error' ? (
          <div className="flex h-full flex-1 items-center justify-center px-6">
            <p className="text-sm text-muted-foreground">{statusState.error}</p>
          </div>
        ) : (
          <div className="flex h-full flex-1 items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderCircleIcon className="size-3.5 animate-spin" />
              Resolving default branch...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
