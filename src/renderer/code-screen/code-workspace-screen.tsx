import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';

import {
  BotIcon,
  FileCodeIcon,
  GitBranchPlusIcon,
  LoaderCircleIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react';
import { motion } from 'motion/react';

import { ChangesPane } from '@/renderer/code-screen/changes-pane';
import { ChatComposer } from '@/renderer/code-screen/chat-composer';
import { SessionAlerts } from '@/renderer/code-screen/session-alerts';
import { SessionTranscript } from '@/renderer/code-screen/session-transcript';
import { useCodeTargets } from '@/renderer/code-screen/use-code-targets';
import {
  useCodexSessionActions,
  useCodexSessionState,
} from '@/renderer/hooks/use-codex-sessions';
import {
  useGitDefaultBranch,
  useGitStateWatch,
  useGitStatus,
} from '@/renderer/hooks/use-git';
import { Button } from '@/shadcn/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/shadcn/components/ui/tabs';
import { cn } from '@/shadcn/lib/utils';

const TEMPORARY_WORKTREE_BRANCH_PATTERN = /^codex\/[0-9a-f]{8}$/;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 500;
const SIDEBAR_DEFAULT_WIDTH = 280;

type ActiveLayer = 'files' | 'codex';

function ResizableHandle({
  onResize,
  onResizeStart,
}: {
  onResize: (deltaX: number) => void;
  onResizeStart?: () => void;
}) {
  const handleMouseDown = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      onResizeStart?.();
      const startX = event.clientX;

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

export function CodeWorkspaceScreen({
  repoId,
  repoPath,
}: {
  repoId: string;
  repoPath: string;
}) {
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>('codex');
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

  const handleSendPrompt = useCallback(async (prompt: string) => {
    if (
      activeTarget.kind === 'worktree' &&
      sessionState.messages.length === 0 &&
      TEMPORARY_WORKTREE_BRANCH_PATTERN.test(activeTarget.title)
    ) {
      const promotion = await window.electronAPI.promoteGitWorktreeBranch(
        activeTarget.cwd,
        activeTarget.title,
        prompt,
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

    await sendPrompt(activeTarget.id, activeTarget.cwd, prompt);
  }, [
    activeTarget,
    defaultBranchState,
    rootStatusState,
    sendPrompt,
    sessionState.messages.length,
    statusState,
    updateTarget,
  ]);

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
  const activeTargetLabel = targetLabels[activeTarget.id] ?? activeTarget.title;

  return (
    <div className="flex h-full min-h-0 flex-col">
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
                onClick={addCurrentBranchSession}
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

      <div className="flex min-h-0 flex-1">
        {defaultBranchState.status === 'ready' && statusState.status === 'ready' ? (
          <ChangesPane
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
                <div
                  className="flex shrink-0 flex-col overflow-hidden border-r border-border"
                  style={{ width: sidebarWidth }}
                >
                  {sidebar}
                </div>
                <ResizableHandle onResizeStart={() => { sidebarWidthAtDragStart.current = sidebarWidth; }} onResize={handleSidebarResize} />

                <div className="flex min-w-0 flex-1 flex-col">
                  <LayerToggle activeLayer={activeLayer} onChangeLayer={setActiveLayer} />

                  <div className="relative min-h-0 flex-1">
                    <Layer active={activeLayer === 'files'}>
                      {viewport}
                    </Layer>
                    <Layer active={activeLayer === 'codex'}>
                      <SessionTranscript
                        sessionState={sessionState}
                        targetLabel={activeTargetLabel}
                        onCreateSession={addCurrentBranchSession}
                      />
                    </Layer>
                  </div>

                  <div
                    className="border-t border-border px-4 pb-3 pt-2"
                    onFocus={() => setActiveLayer('codex')}
                  >
                    <SessionAlerts
                      targetId={activeTarget.id}
                      sessionError={sessionState.error}
                      pendingApprovals={sessionState.pendingApprovals}
                      pendingUserInputs={sessionState.pendingUserInputs}
                      onRespondToApproval={respondToApproval}
                      onRespondToUserInput={respondToUserInput}
                    />

                    <ChatComposer
                      targetLabel={activeTargetLabel}
                      isRunning={isRunning}
                      onSendPrompt={handleSendPrompt}
                      onInterrupt={() => interruptSession(activeTarget.id)}
                    />
                  </div>
                </div>

                {historyDrawer}
              </>
            )}
          </ChangesPane>
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
