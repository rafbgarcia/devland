import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import {
  GitBranchPlusIcon,
  LoaderCircleIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import {
  DEFAULT_CODEX_COMPOSER_SETTINGS,
  type CodexComposerSettings,
  type CodexPromptSubmission,
} from '@/lib/codex-chat';
import {
  type CodeTarget,
  type CodeWorkspacePane,
  type RemoveGitWorktreeReason,
} from '@/ipc/contracts';
import { BrowserPanel } from '@/renderer/code-screen/browser/browser-panel';
import { clearBrowserTargetState } from '@/renderer/code-screen/browser/browser-target-state';
import { ChangesPane } from '@/renderer/code-screen/changes-pane';
import { ChatComposer } from '@/renderer/code-screen/chat-composer';
import { CodexTabMenu } from '@/renderer/code-screen/codex-tab-menu';
import { LayerToggle } from '@/renderer/code-screen/layer-toggle';
import { SessionAlerts } from '@/renderer/code-screen/session-alerts';
import { SessionTerminal } from '@/renderer/code-screen/session-terminal';
import { SessionTranscript } from '@/renderer/code-screen/session-transcript';
import { useCodeTargets } from '@/renderer/code-screen/use-code-targets';
import {
  useCodexSessionActions,
  useCodexSessionState,
} from '@/renderer/code-screen/use-codex-sessions';
import {
  useGitDefaultBranch,
  useGitStatus,
} from '@/renderer/code-screen/use-git';
import {
  DETACHED_WORKTREE_TARGET_TITLE,
  getWorktreeTargetTitle,
  getWorktreePromptText,
  shouldBootstrapDetachedWorktreeBranch,
} from '@/renderer/code-screen/worktree-session';
import {
  getGitStatusRefreshRequestForCodexEvent,
  requestGitStatusRefresh,
  subscribeToGitStatusRefresh,
} from '@/renderer/shared/lib/git-status-refresh';
import {
  getRememberedCodePaneId,
  getRememberedCodeTargetId,
  rememberCodePane,
  rememberCodeTarget,
} from '@/renderer/shared/lib/workspace-view-state';
import { useWorkspaceSession } from '@/renderer/projects-shell/use-workspace-session';
import { useRepos } from '@/renderer/projects-shell/use-repos';
import { Button } from '@/shadcn/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shadcn/components/ui/dialog';
import { Tabs } from '@/shadcn/components/ui/tabs';
import { cn } from '@/shadcn/lib/utils';

const SESSION_TARGET_TITLE_PATTERN = /^Session\s+(\d+)$/;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 500;
const SIDEBAR_DEFAULT_WIDTH = 280;

type PendingWorktreeRemoval = {
  target: CodeTarget;
  wasActive: boolean;
  reasons: RemoveGitWorktreeReason[];
};

function formatCodeTargetLabel(target: CodeTarget, rootBranch: string) {
  if (target.kind === 'root') {
    return rootBranch;
  }

  if (target.kind === 'session') {
    const match = SESSION_TARGET_TITLE_PATTERN.exec(target.title);

    if (match !== null) {
      return `${rootBranch}.${Number(match[1]) + 1}`;
    }
  }

  return target.title;
}

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

export function CodeWorkspaceScreen({
  repoId,
  repoPath,
}: {
  repoId: string;
  repoPath: string;
}) {
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
  const [pendingWorktreeRemoval, setPendingWorktreeRemoval] = useState<PendingWorktreeRemoval | null>(null);
  const [isRemovingWorktree, setIsRemovingWorktree] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [composerSettingsByTargetId, setComposerSettingsByTargetId] = useState<
    Record<string, CodexComposerSettings>
  >({});
  const sidebarWidthAtDragStart = useRef(SIDEBAR_DEFAULT_WIDTH);
  const repos = useRepos();
  const { session, updateSession } = useWorkspaceSession();
  const storedRepoPaths = useMemo(() => repos.map((repo) => repo.path), [repos]);
  const rememberedTargetId = getRememberedCodeTargetId(session, repoId);
  const activePaneId = getRememberedCodePaneId(session, repoId);

  const {
    rootTarget,
    targets,
    activeTarget,
    activeTargetId,
    addCurrentBranchSession,
    addWorktreeTarget,
    removeTarget,
    restoreTarget,
    updateTarget,
  } = useCodeTargets(repoId, repoPath, rememberedTargetId);
  const sessionState = useCodexSessionState(activeTarget.id);
  const {
    sendPrompt,
    interruptSession,
    stopSession,
    resetSession,
    resumeThread,
    respondToApproval,
    respondToUserInput,
  } = useCodexSessionActions();
  const rootStatusState = useGitStatus(repoPath);
  const defaultBranchState = useGitDefaultBranch(repoPath);
  const statusState = useGitStatus(activeTarget.cwd);

  const activeBranch = statusState.data?.branch ?? 'HEAD';
  const rootBranch = rootStatusState.data?.branch ?? 'HEAD';
  const visibleChangesStatus = useMemo(() => {
    if (statusState.status === 'ready') {
      return statusState.data;
    }

    return {
      branch:
        activeTarget.kind === 'worktree'
          ? activeTarget.title !== DETACHED_WORKTREE_TARGET_TITLE
            ? activeTarget.title
            : 'HEAD'
          : rootBranch,
      headRevision: null,
      files: [],
      hasStagedChanges: false,
    };
  }, [activeTarget.kind, activeTarget.title, rootBranch, statusState]);
  const visibleBaseBranchName = defaultBranchState.status === 'ready'
    ? defaultBranchState.data
    : rootBranch;
  const changesPaneError = defaultBranchState.status === 'error'
    ? defaultBranchState.error
    : statusState.status === 'error'
      ? statusState.error
      : null;

  const rememberActiveTarget = useCallback(
    (targetId: string | null) => {
      updateSession((currentSession) => rememberCodeTarget(currentSession, repoId, targetId));
    },
    [repoId, updateSession],
  );

  const rememberActivePane = useCallback(
    (paneId: CodeWorkspacePane) => {
      updateSession((currentSession) => rememberCodePane(currentSession, repoId, paneId));
    },
    [repoId, updateSession],
  );

  useEffect(() => {
    if (rememberedTargetId === activeTargetId) {
      return;
    }

    rememberActiveTarget(activeTargetId);
  }, [activeTargetId, rememberActiveTarget, rememberedTargetId]);

  const handleGitStatusRefresh = useEffectEvent((changedRepoPath: string) => {
    const refreshes: Promise<unknown>[] = [];

    if (changedRepoPath === repoPath) {
      refreshes.push(rootStatusState.refetch(), defaultBranchState.refetch());
    }

    if (changedRepoPath === activeTarget.cwd) {
      refreshes.push(statusState.refetch());
    }

    if (refreshes.length === 0) {
      return;
    }

    void Promise.all(refreshes).catch((error) => {
      console.error('Failed to refresh Git state:', error);
    });
  });

  useEffect(() => subscribeToGitStatusRefresh((request) => {
    handleGitStatusRefresh(request.repoPath);
  }), [handleGitStatusRefresh]);

  useEffect(() => {
    const handleWindowFocus = () => {
      requestGitStatusRefresh({ repoPath, reason: 'window-focus' });

      if (activeTarget.cwd !== repoPath) {
        requestGitStatusRefresh({ repoPath: activeTarget.cwd, reason: 'window-focus' });
      }
    };

    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [activeTarget.cwd, repoPath]);

  useEffect(() => window.electronAPI.onCodexSessionEvent((event) => {
    if (event.sessionId !== activeTarget.id) {
      return;
    }

    const request = getGitStatusRefreshRequestForCodexEvent(event, activeTarget.cwd);

    if (request !== null) {
      requestGitStatusRefresh(request);
    }
  }), [activeTarget.cwd, activeTarget.id]);

  const targetLabels = useMemo(
    () =>
      Object.fromEntries(
        targets.map((target) => [target.id, formatCodeTargetLabel(target, rootBranch)]),
      ),
    [rootBranch, targets],
  );

  const composerSettings =
    composerSettingsByTargetId[activeTarget.id] ?? DEFAULT_CODEX_COMPOSER_SETTINGS;

  const handleComposerSettingsChange = useCallback((settings: CodexComposerSettings) => {
    setComposerSettingsByTargetId((current) => ({
      ...current,
      [activeTarget.id]: settings,
    }));
  }, [activeTarget.id]);

  const bootstrapDetachedWorktreeBranch = useCallback(async (submission: CodexPromptSubmission) => {
    if (activeTarget.kind !== 'worktree') {
      return;
    }

    const suggestion = await window.electronAPI.suggestGitWorktreeBranchName(
      activeTarget.cwd,
      getWorktreePromptText(submission),
    );

    await window.electronAPI.createGitBranch(activeTarget.cwd, suggestion.branch);
    updateTarget(activeTarget.id, (target) => ({
      ...target,
      title: suggestion.branch,
    }));
    await Promise.all([
      statusState.refetch(),
      defaultBranchState.refetch(),
    ]);
  }, [
    activeTarget,
    defaultBranchState,
    statusState,
    updateTarget,
  ]);

  const handleSendPrompt = useCallback(async (submission: CodexPromptSubmission) => {
    const shouldBootstrapBranch = shouldBootstrapDetachedWorktreeBranch(
      activeTarget,
      sessionState.messages.length,
    );

    await sendPrompt(
      activeTarget.id,
      activeTarget.cwd,
      submission,
      shouldBootstrapBranch
        ? {
            background: true,
            beforeSend: () => bootstrapDetachedWorktreeBranch(submission),
          }
        : undefined,
    );
  }, [
    activeTarget,
    bootstrapDetachedWorktreeBranch,
    sendPrompt,
    sessionState.messages.length,
  ]);

  const handleCreateWorktree = async () => {
    setIsCreatingWorktree(true);

    try {
      const result = await window.electronAPI.createGitWorktree(repoPath, activeBranch);
      const target = addWorktreeTarget(result.cwd, result.initialTitle);

      rememberActiveTarget(target.id);

      if (result.worktreeSetupCommand) {
        void window.electronAPI.execTerminalSessionCommand({
          sessionId: target.id,
          cwd: result.cwd,
          command: result.worktreeSetupCommand,
        }).catch((error) => {
          console.error('Failed to start worktree setup command:', error);
        });
      }
    } catch (error) {
      console.error('Failed to create worktree:', error);
    } finally {
      setIsCreatingWorktree(false);
    }
  };

  const removeTargetFromUi = useCallback((target: CodeTarget, wasActive: boolean) => {
    removeTarget(target.id);

    if (wasActive) {
      rememberActiveTarget(rootTarget.id);
    }
  }, [
    rememberActiveTarget,
    removeTarget,
    rootTarget.id,
  ]);

  const restoreTargetInUi = useCallback((target: CodeTarget, wasActive: boolean) => {
    restoreTarget(target);

    if (wasActive) {
      rememberActiveTarget(target.id);
    }
  }, [
    rememberActiveTarget,
    restoreTarget,
  ]);

  const disposeTargetResources = useCallback(async (target: CodeTarget) => {
    await stopSession(target.id);
    await window.electronAPI.closeTerminalSession(target.id);
    await window.electronAPI.disposeBrowserView(target.id);
    clearBrowserTargetState(target.id);
  }, [stopSession]);

  const removeClosedWorktree = useCallback(async (
    target: CodeTarget,
    wasActive: boolean,
    force: boolean,
  ) => {
    let worktreeRemoved = false;

    try {
      await window.electronAPI.closeTerminalSession(target.id);
      await window.electronAPI.disposeBrowserView(target.id);
      clearBrowserTargetState(target.id);
      await window.electronAPI.removeGitWorktree(repoPath, target.cwd, force);
      worktreeRemoved = true;
      await stopSession(target.id);
    } catch (error) {
      console.error('Failed to remove worktree:', error);

      if (!worktreeRemoved) {
        restoreTargetInUi(target, wasActive);
      }
    }
  }, [
    repoPath,
    restoreTargetInUi,
    stopSession,
  ]);

  const handleRemoveTarget = useCallback(async (targetId: string) => {
    const target = targets.find((candidate) => candidate.id === targetId);

    if (!target || target.kind === 'root') {
      return;
    }

    const wasActive = activeTargetId === target.id;

    if (target.kind !== 'worktree') {
      removeTargetFromUi(target, wasActive);
      void disposeTargetResources(target).catch((error) => {
        console.error('Failed to close target:', error);
        restoreTargetInUi(target, wasActive);
      });
      return;
    }

    void (async () => {
      try {
        const removal = await window.electronAPI.checkGitWorktreeRemoval(
          repoPath,
          target.cwd,
        );

        if (removal.status === 'confirmation-required') {
          setPendingWorktreeRemoval({
            target,
            wasActive,
            reasons: removal.reasons,
          });
          return;
        }

        removeTargetFromUi(target, wasActive);
        await removeClosedWorktree(target, wasActive, false);
      } catch (error) {
        console.error('Failed to remove worktree:', error);
      }
    })();
  }, [
    activeTargetId,
    disposeTargetResources,
    removeClosedWorktree,
    removeTargetFromUi,
    repoPath,
    targets,
  ]);

  const handleConfirmWorktreeRemoval = useCallback(async () => {
    if (pendingWorktreeRemoval === null) {
      return;
    }

    const { target, wasActive } = pendingWorktreeRemoval;

    setIsRemovingWorktree(true);
    setPendingWorktreeRemoval(null);
    removeTargetFromUi(target, wasActive);

    void (async () => {
      try {
        await removeClosedWorktree(target, wasActive, true);
      } finally {
        setIsRemovingWorktree(false);
      }
    })();
  }, [
    removeClosedWorktree,
    pendingWorktreeRemoval,
    removeTargetFromUi,
  ]);

  useEffect(() => {
    if (activeTarget.kind !== 'worktree' || statusState.status !== 'ready') {
      return;
    }

    const nextTitle = getWorktreeTargetTitle(statusState.data.branch);

    if (activeTarget.title === nextTitle) {
      return;
    }

    updateTarget(activeTarget.id, (target) => ({
      ...target,
      title: nextTitle,
    }));
  }, [
    activeTarget.id,
    activeTarget.kind,
    activeTarget.title,
    statusState,
    updateTarget,
  ]);

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

    await handleSendPrompt({
      prompt: `Process this anchored diff comment.\n\nContext:\n\`\`\`json\n${payload}\n\`\`\`\n\nUser comment:\n${body}`,
      settings: composerSettings,
      attachments: [],
    });
    rememberActivePane('codex');
  }, [
    composerSettings,
    handleSendPrompt,
    rememberActivePane,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'n' && event.metaKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        resetSession(activeTarget.id);
      }

      if (event.key === 'Escape' && sessionState.status === 'running') {
        event.preventDefault();
        void interruptSession(activeTarget.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTarget.id, interruptSession, resetSession, sessionState.status]);

  const isRunning =
    sessionState.status === 'connecting' || sessionState.status === 'running';
  const activeTargetLabel = targetLabels[activeTarget.id] ?? activeTarget.title;
  const pendingWorktreeRemovalDescription = useMemo(() => {
    if (pendingWorktreeRemoval === null) {
      return '';
    }

    const messages: string[] = [];

    if (pendingWorktreeRemoval.reasons.includes('dirty')) {
      messages.push('This worktree has modified or untracked files that will be discarded.');
    }

    if (pendingWorktreeRemoval.reasons.includes('unreferenced-detached-head')) {
      messages.push('Its detached HEAD contains commits that are not referenced by any branch and may become unreachable.');
    }

    return messages.join(' ');
  }, [pendingWorktreeRemoval]);
  const handleActiveTargetChange = useCallback(
    (targetId: string) => {
      rememberActiveTarget(targetId);
    },
    [rememberActiveTarget],
  );
  const handleAddCurrentBranchSession = useCallback(() => {
    const target = addCurrentBranchSession();

    rememberActiveTarget(target.id);
  }, [addCurrentBranchSession, rememberActiveTarget]);

  const renderWorkspaceLayout = useCallback((
    sidebar: ReactNode,
    viewport: ReactNode,
  ) => (
    <>
      <div
        className="flex shrink-0 flex-col overflow-hidden border-r border-border"
        style={{ width: sidebarWidth }}
      >
        {sidebar}
      </div>
      <ResizableHandle onResizeStart={() => { sidebarWidthAtDragStart.current = sidebarWidth; }} onResize={handleSidebarResize} />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <LayerToggle
          activePaneId={activePaneId}
          onChangePane={rememberActivePane}
          codexMenu={(
            <CodexTabMenu
              cwd={activeTarget.cwd}
              currentThreadId={sessionState.threadId}
              settings={composerSettings}
              onSettingsChange={handleComposerSettingsChange}
              onNewSession={() => resetSession(activeTarget.id)}
              onSelectThread={(threadId) =>
                resumeThread(activeTarget.id, activeTarget.cwd, composerSettings, threadId)
              }
            />
          )}
        />

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activePaneId}
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.1 }}
              className="h-full origin-center overflow-auto"
            >
              {activePaneId === 'changes' ? (
                viewport
              ) : activePaneId === 'browser' ? (
                <BrowserPanel key={activeTarget.id} targetId={activeTarget.id} />
              ) : activePaneId === 'terminal' ? (
                <SessionTerminal
                  key={activeTarget.id}
                  sessionId={activeTarget.id}
                  cwd={activeTarget.cwd}
                />
              ) : (
                <SessionTranscript
                  sessionState={sessionState}
                  targetLabel={activeTargetLabel}
                  onCreateSession={handleAddCurrentBranchSession}
                  onSendSuggestion={(prompt) => {
                    void handleSendPrompt({ prompt, settings: composerSettings, attachments: [] });
                    rememberActivePane('codex');
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div
          className="shrink-0 border-t border-border/60 bg-background px-4 pb-3 pt-2.5"
          onFocus={() => {
            if (activePaneId !== 'browser') {
              rememberActivePane('codex');
            }
          }}
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
            key={activeTarget.id}
            activeRepoPath={activeTarget.cwd}
            storedRepoPaths={storedRepoPaths}
            settings={composerSettings}
            isRunning={isRunning}
            onSendPrompt={handleSendPrompt}
            onInterrupt={() => interruptSession(activeTarget.id)}
          />
        </div>
      </div>
    </>
  ), [
    activePaneId,
    activeTarget.cwd,
    activeTarget.id,
    activeTargetLabel,
    composerSettings,
    handleAddCurrentBranchSession,
    handleComposerSettingsChange,
    handleSendPrompt,
    handleSidebarResize,
    interruptSession,
    isRunning,
    rememberActivePane,
    resetSession,
    respondToApproval,
    respondToUserInput,
    resumeThread,
    sessionState.error,
    sessionState.pendingApprovals,
    sessionState.pendingUserInputs,
    sessionState.threadId,
    sidebarWidth,
    storedRepoPaths,
  ]);

  return (
    <>
      <Dialog
        open={pendingWorktreeRemoval !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !isRemovingWorktree) {
            setPendingWorktreeRemoval(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove worktree?</DialogTitle>
            <DialogDescription>
              {pendingWorktreeRemoval === null
                ? ''
                : `Removing ${pendingWorktreeRemoval.target.title} will delete the git worktree. ${pendingWorktreeRemovalDescription}`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingWorktreeRemoval(null)}
              disabled={isRemovingWorktree}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmWorktreeRemoval()}
              disabled={isRemovingWorktree}
            >
              {isRemovingWorktree ? (
                <LoaderCircleIcon data-icon="inline-start" className="animate-spin" />
              ) : null}
              Remove worktree
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex h-full min-h-0 flex-col">
      <Tabs className="gap-0" value={activeTargetId} onValueChange={handleActiveTargetChange}>
        <div className="flex items-center gap-1 border-b border-border bg-muted/20 px-2 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {targets.map((target) => {
              const isActive = activeTargetId === target.id;
              const label = targetLabels[target.id] ?? target.title;

              return (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => handleActiveTargetChange(target.id)}
                  className={cn(
                    'group/tab relative flex max-w-[16rem] shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors',
                    isActive
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-background/50 hover:text-foreground/80',
                  )}
                >
                  {target.kind === 'worktree' ? (
                    <GitBranchPlusIcon className="size-3 shrink-0 text-muted-foreground/60" />
                  ) : null}
                  <span className="truncate">{label}</span>
                  {target.kind !== 'root' ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void handleRemoveTarget(target.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.stopPropagation();
                          void handleRemoveTarget(target.id);
                        }
                      }}
                      className="ml-0.5 flex size-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity hover:bg-muted group-hover/tab:opacity-60 group-hover/tab:hover:opacity-100"
                      aria-label={target.kind === 'worktree' ? `Remove worktree ${target.title}` : `Close session ${target.title}`}
                    >
                      <XIcon className="size-2.5" />
                    </span>
                  ) : null}
                </button>
              );
            })}

            <button
              type="button"
              onClick={handleAddCurrentBranchSession}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-background/50 hover:text-muted-foreground"
              aria-label="New session on current branch"
            >
              <PlusIcon className="size-3" />
            </button>
          </div>

          <div className="shrink-0 border-l border-border/40 pl-2">
            <button
              type="button"
              onClick={handleCreateWorktree}
              disabled={isCreatingWorktree}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-background/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              {isCreatingWorktree ? (
                <LoaderCircleIcon className="size-3 animate-spin" />
              ) : (
                <GitBranchPlusIcon className="size-3" />
              )}
              Worktree
            </button>
          </div>
        </div>
      </Tabs>

      <div className="flex min-h-0 flex-1">
        {changesPaneError !== null ? (
          renderWorkspaceLayout(
            <div className="flex h-full items-center justify-center px-6">
              <p className="text-sm text-muted-foreground">{changesPaneError}</p>
            </div>,
            <div className="flex h-full items-center justify-center px-6">
              <p className="text-sm text-muted-foreground">{changesPaneError}</p>
            </div>,
          )
        ) : (
          <ChangesPane
            repoPath={activeTarget.cwd}
            baseBranchName={visibleBaseBranchName}
            branchName={visibleChangesStatus.branch}
            headRevision={visibleChangesStatus.headRevision}
            workingTreeFiles={visibleChangesStatus.files}
            workingTreeStatusRefreshVersion={statusState.refreshVersion}
            isViewportActive={activePaneId === 'changes'}
            onFileSelect={() => rememberActivePane('changes')}
            onSubmitDiffComment={(anchor, body) => handleSubmitDiffComment(anchor, body)}
          >
            {({ sidebar, viewport }) => renderWorkspaceLayout(sidebar, viewport)}
          </ChangesPane>
        )}
      </div>
      </div>
    </>
  );
}
