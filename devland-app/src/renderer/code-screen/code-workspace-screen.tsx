import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import {
  BotIcon,
  FileCodeIcon,
  GitBranchPlusIcon,
  GlobeIcon,
  LoaderCircleIcon,
  PlusIcon,
  TerminalIcon,
  XIcon,
} from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';

import {
  DEFAULT_CODEX_COMPOSER_SETTINGS,
  type CodexComposerSettings,
  type CodexPromptSubmission,
} from '@/lib/codex-chat';
import {
  type CodeTarget,
  type CodeWorkspacePane,
} from '@/ipc/contracts';
import { BrowserPanel } from '@/renderer/code-screen/browser/browser-panel';
import { clearBrowserTargetState } from '@/renderer/code-screen/browser/browser-target-state';
import { ChangesPane } from '@/renderer/code-screen/changes-pane';
import { ChatComposer } from '@/renderer/code-screen/chat-composer';
import { CodexTabMenu } from '@/renderer/code-screen/codex-tab-menu';
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
import { Tabs } from '@/shadcn/components/ui/tabs';
import { cn } from '@/shadcn/lib/utils';

const TEMPORARY_WORKTREE_BRANCH_PATTERN = /^codex\/[0-9a-f]{8}$/;
const SESSION_TARGET_TITLE_PATTERN = /^Session\s+(\d+)$/;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 500;
const SIDEBAR_DEFAULT_WIDTH = 280;

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

const LAYER_TABS: { id: CodeWorkspacePane; label: string; icon: typeof BotIcon }[] = [
  { id: 'changes', label: 'Changes', icon: FileCodeIcon },
  { id: 'codex', label: 'Codex', icon: BotIcon },
  { id: 'browser', label: 'Browser', icon: GlobeIcon },
  { id: 'terminal', label: 'Terminal', icon: TerminalIcon },
];

function LayerToggle({
  activePaneId,
  onChangePane,
  codexMenu,
}: {
  activePaneId: CodeWorkspacePane;
  onChangePane: (paneId: CodeWorkspacePane) => void;
  codexMenu: React.ReactNode;
}) {
  return (
    <LayoutGroup id="layer-toggle">
      <div className="flex items-center gap-0.5 border-b border-border bg-muted/30 px-3 py-1.5">
        {LAYER_TABS.map((tab) => {
          const isActive = activePaneId === tab.id;
          const TabIcon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangePane(tab.id)}
              className={cn(
                'relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {isActive ? (
                <motion.div
                  layoutId="layer-toggle-pill"
                  className="absolute inset-0 z-0 rounded-md bg-background shadow-sm"
                  transition={{ type: 'tween', duration: 0.1 }}
                />
              ) : null}
              <TabIcon className="relative z-10 size-3" />
              <span className="relative z-10">{tab.label}</span>
              {tab.id === 'codex' ? <span className="relative z-10">{codexMenu}</span> : null}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
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
  const defaultBranchState = useGitDefaultBranch(activeTarget.cwd);
  const statusState = useGitStatus(activeTarget.cwd);

  const activeBranch = statusState.data?.branch ?? 'HEAD';
  const rootBranch = rootStatusState.data?.branch ?? 'HEAD';

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
      refreshes.push(rootStatusState.refetch());
    }

    if (changedRepoPath === activeTarget.cwd) {
      refreshes.push(statusState.refetch(), defaultBranchState.refetch());
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

  const handleSendPrompt = useCallback(async (submission: CodexPromptSubmission) => {
    const branchPromotionPrompt =
      submission.prompt.trim().length > 0
        ? submission.prompt
        : submission.attachments.map((attachment) => attachment.name).join(', ') || 'update';

    if (
      activeTarget.kind === 'worktree' &&
      sessionState.messages.length === 0 &&
      TEMPORARY_WORKTREE_BRANCH_PATTERN.test(activeTarget.title)
    ) {
      const promotion = await window.electronAPI.promoteGitWorktreeBranch(
        activeTarget.cwd,
        activeTarget.title,
        branchPromotionPrompt,
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

    await sendPrompt(activeTarget.id, activeTarget.cwd, submission);
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
      const target = addWorktreeTarget(result.cwd, result.branch);

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

  const handleRemoveTarget = useCallback(async (targetId: string) => {
    const target = targets.find((candidate) => candidate.id === targetId);

    if (!target || target.kind === 'root') {
      return;
    }

    await stopSession(target.id);
    await window.electronAPI.closeTerminalSession(target.id);
    await window.electronAPI.disposeBrowserView(target.id);
    clearBrowserTargetState(target.id);
    removeTarget(target.id);

    if (activeTargetId === target.id) {
      rememberActiveTarget(rootTarget.id);
    }
  }, [
    activeTargetId,
    rememberActiveTarget,
    removeTarget,
    rootTarget.id,
    stopSession,
    targets,
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

    await sendPrompt(
      activeTarget.id,
      activeTarget.cwd,
      {
        prompt: `Process this anchored diff comment.\n\nContext:\n\`\`\`json\n${payload}\n\`\`\`\n\nUser comment:\n${body}`,
        settings: composerSettings,
        attachments: [],
      },
    );
    rememberActivePane('codex');
  }, [
    activeTarget.cwd,
    activeTarget.id,
    composerSettings,
    rememberActivePane,
    sendPrompt,
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

  const isRunning = sessionState.status === 'running';
  const activeTargetLabel = targetLabels[activeTarget.id] ?? activeTarget.title;
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

  return (
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
        {defaultBranchState.status === 'ready' && statusState.status === 'ready' ? (
          <ChangesPane
            repoPath={activeTarget.cwd}
            baseBranchName={defaultBranchState.data}
            branchName={statusState.data.branch}
            headRevision={statusState.data.headRevision}
            workingTreeFiles={statusState.data.files}
            workingTreeStatusRefreshVersion={statusState.refreshVersion}
            isViewportActive={activePaneId === 'changes'}
            onFileSelect={() => rememberActivePane('changes')}
            onSubmitDiffComment={(anchor, body) => handleSubmitDiffComment(anchor, body)}
          >
            {({ sidebar, viewport }) => (
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
                    codexMenu={
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
                    }
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
