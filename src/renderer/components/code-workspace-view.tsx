import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';

import {
  BotIcon,
  FileCodeIcon,
  GitBranchPlusIcon,
  LoaderCircleIcon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from 'lucide-react';
import { motion } from 'motion/react';

import { CodeChanges } from '@/renderer/components/code-changes';
import { useCodeTargets } from '@/renderer/hooks/use-code-targets';
import {
  useCodexSessionActions,
  useCodexSessionState,
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import { Textarea } from '@/shadcn/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/shadcn/components/ui/tabs';
import { cn } from '@/shadcn/lib/utils';

const TEMPORARY_WORKTREE_BRANCH_PATTERN = /^codex\/[0-9a-f]{8}$/;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 500;
const SIDEBAR_DEFAULT_WIDTH = 280;

type ActiveLayer = 'files' | 'codex';

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

function MessageBubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  return (
    <div className={cn('flex', role === 'user' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm',
          role === 'user'
            ? 'bg-foreground text-background'
            : 'border border-border bg-card text-card-foreground',
        )}
      >
        {text}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CodexSessionOutput
// ---------------------------------------------------------------------------

function CodexSessionOutput({
  sessionState,
  targetLabel,
  onCreateSession,
}: {
  sessionState: CodexSessionState;
  targetLabel: string;
  onCreateSession: () => void;
}) {
  const hasConversation =
    sessionState.messages.length > 0 ||
    sessionState.streamingAssistantText.trim().length > 0;

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
              Use the composer below to inspect, edit, or compare code in this target.
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
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4">
        {sessionState.messages.map((message) => (
          <MessageBubble key={message.id} role={message.role} text={message.text} />
        ))}
        {sessionState.streamingAssistantText.trim().length > 0 ? (
          <MessageBubble role="assistant" text={sessionState.streamingAssistantText} />
        ) : null}
        {sessionState.activities.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-border bg-card/60 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <SparklesIcon className="size-4 text-muted-foreground" />
              Work log
            </div>
            <div className="flex flex-col gap-2">
              {sessionState.activities.map((activity) => (
                <div
                  key={activity.id}
                  className="rounded-xl border border-border/80 bg-background px-3 py-2"
                >
                  <div className="text-sm font-medium">{activity.label}</div>
                  {activity.detail ? (
                    <div className="mt-1 text-sm text-muted-foreground">{activity.detail}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
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
  const [gitStateVersion, setGitStateVersion] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const sidebarWidthAtDragStart = useRef(SIDEBAR_DEFAULT_WIDTH);

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
    setGitStateVersion((current) => current + 1);
  });

  const targetLabels = useMemo(
    () =>
      Object.fromEntries(
        targets.map((target) => {
          if (target.kind === 'root') {
            return [target.id, `Current branch · ${rootBranch}`];
          }

          if (target.kind === 'session') {
            return [target.id, `${target.title} · ${rootBranch}`];
          }

          return [target.id, target.title];
        }),
      ),
    [rootBranch, targets],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
            workingTreeFiles={statusState.data.files}
            gitStateVersion={gitStateVersion}
            onFileSelect={() => setActiveLayer('files')}
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
                      />
                    </Layer>
                  </div>

                  {/* Codex input - always visible */}
                  <div
                    className="border-t border-border px-6 py-4"
                    onFocus={() => setActiveLayer('codex')}
                  >
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
                      {sessionState.error ? (
                        <Alert variant="destructive">
                          <AlertTitle>Codex session error</AlertTitle>
                          <AlertDescription>{sessionState.error}</AlertDescription>
                        </Alert>
                      ) : null}

                      {activePendingApproval ? (
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
                      ) : null}

                      {activePendingUserInput ? (
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
                      ) : null}

                      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
                        <Textarea
                          className="min-h-28 resize-none"
                          placeholder={`Ask Codex about ${targetLabels[activeTarget.id] ?? activeTarget.title}`}
                          value={prompt}
                          onChange={(event) => setPrompt(event.target.value)}
                          disabled={sessionState.status === 'running' || isSending}
                        />
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm text-muted-foreground">
                            {sessionState.status === 'running'
                              ? 'Codex is working on this target.'
                              : `Working directory: ${activeTarget.cwd}`}
                          </div>
                          <div className="flex gap-2">
                            {sessionState.status === 'running' ? (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => void interruptSession(activeTarget.id)}
                              >
                                Stop
                              </Button>
                            ) : null}
                            <Button
                              type="submit"
                              disabled={
                                !prompt.trim() || isSending || sessionState.status === 'running'
                              }
                            >
                              {isSending ? (
                                <LoaderCircleIcon
                                  className="animate-spin"
                                  data-icon="inline-start"
                                />
                              ) : (
                                <SparklesIcon data-icon="inline-start" />
                              )}
                              Send to Codex
                            </Button>
                          </div>
                        </div>
                      </form>
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
