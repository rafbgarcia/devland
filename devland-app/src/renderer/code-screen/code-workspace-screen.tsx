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
import { AnimatePresence, motion, Reorder } from 'motion/react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shadcn/components/ui/tooltip';

import {
  type CodexComposerSettings,
  type CodexPromptSubmission,
} from '@/lib/codex-chat';
import type { RepoSuggestedPrompt } from '@/extensions/contracts';
import {
  type AppShortcutCommand,
  type CodeTarget,
  type CodeWorkspacePane,
  type RemoveGitWorktreeReason,
} from '@/ipc/contracts';
import {
  clearBrowserViewState,
  clearCodeTargetBrowserState,
} from '@/renderer/code-screen/browser/browser-view-state';
import { ChangesPane } from '@/renderer/code-screen/changes-pane';
import {
  ChatComposer,
  type ChatComposerHandle,
} from '@/renderer/code-screen/chat-composer';
import { formatAnchoredDiffCommentPrompt } from '@/renderer/code-screen/chat-composer-prompt';
import { CodexTabMenu } from '@/renderer/code-screen/codex-tab-menu';
import { LayerToggle } from '@/renderer/code-screen/layer-toggle';
import { LivePlanDock } from '@/renderer/code-screen/live-plan-dock';
import { buildPlanImplementationPrompt } from '@/renderer/code-screen/proposed-plan';
import { SessionAlerts } from '@/renderer/code-screen/session-alerts';
import { SessionTranscript } from '@/renderer/code-screen/session-transcript';
import { TargetBrowserPanel } from '@/renderer/code-screen/target-browser-panel';
import { TargetTerminalPanel } from '@/renderer/code-screen/target-terminal-panel';
import { ExternalEditorDialog } from '@/renderer/code-screen/external-editor-dialog';
import {
  isComposerDraftDirty,
  useComposerDraftActions,
  useComposerDrafts,
} from '@/renderer/code-screen/use-composer-drafts';
import { useCodeTargets } from '@/renderer/code-screen/use-code-targets';
import { useRepoBrowserTabs } from '@/renderer/code-screen/use-browser-tabs';
import {
  getDefaultTerminalTabId,
  useRepoTerminalTabs,
} from '@/renderer/code-screen/use-terminal-tabs';
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
import {
  useAppShortcutCommand,
} from '@/renderer/shared/lib/use-app-shortcut-command';
import {
  getAdjacentCodePaneId,
  getAdjacentCodeTargetId,
  getCodeTargetIdAfterClose,
} from '@/renderer/shared/lib/workspace-shortcuts';
import { useWorkspaceSession } from '@/renderer/projects-shell/use-workspace-session';
import { useRepos } from '@/renderer/projects-shell/use-repos';
import {
  useAppPreferences,
  useEnsureExternalEditorPreference,
} from '@/renderer/shared/use-app-preferences';
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

type PendingDraftTargetClose = {
  target: CodeTarget;
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
  const [pendingDraftTargetClose, setPendingDraftTargetClose] = useState<PendingDraftTargetClose | null>(null);
  const [pendingWorktreeRemoval, setPendingWorktreeRemoval] = useState<PendingWorktreeRemoval | null>(null);
  const [isRemovingWorktree, setIsRemovingWorktree] = useState(false);
  const [isExternalEditorDialogOpen, setIsExternalEditorDialogOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [repoSuggestedPrompts, setRepoSuggestedPrompts] = useState<
    RepoSuggestedPrompt[] | null | undefined
  >(null);
  const sidebarWidthAtDragStart = useRef(SIDEBAR_DEFAULT_WIDTH);
  const composerRef = useRef<ChatComposerHandle | null>(null);
  const repos = useRepos();
  const { session, updateSession } = useWorkspaceSession();
  const composerDrafts = useComposerDrafts();
  const { clearDraft: clearComposerDraft } = useComposerDraftActions();
  const {
    preferences,
    setExternalEditorPreference,
    setCodexComposerSettings,
  } = useAppPreferences();
  useEnsureExternalEditorPreference();
  const {
    getTargetState: getBrowserTabsState,
    addTab: addBrowserTab,
    closeTab: closeBrowserTab,
    setActiveTab: setActiveBrowserTab,
    removeTargetState: removeBrowserTabState,
    pruneTargetStates: pruneBrowserTabs,
  } = useRepoBrowserTabs(repoId);
  const {
    getTargetState: getTerminalTabsState,
    addTab: addTerminalTab,
    closeTab: closeTerminalTab,
    renameTab: renameTerminalTab,
    setActiveTab: setActiveTerminalTab,
    removeTargetState: removeTerminalTabState,
    pruneTargetStates: pruneTerminalTabs,
  } = useRepoTerminalTabs(repoId);
  const storedRepoPaths = useMemo(() => repos.map((repo) => repo.path), [repos]);
  const rememberedTargetId = getRememberedCodeTargetId(session, repoId);
  const activePaneId = getRememberedCodePaneId(session, repoId);
  const {
    targets,
    activeTarget,
    activeTargetId,
    addCurrentBranchSession,
    addWorktreeTarget,
    removeTarget,
    reorderTargets,
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
  const worktreeBaseBranchLabel = defaultBranchState.status === 'ready'
    ? defaultBranchState.data
    : 'default branch';
  const changesPaneError = defaultBranchState.status === 'error'
    ? defaultBranchState.error
    : statusState.status === 'error'
      ? statusState.error
      : null;
  const activeBrowserTabsState = getBrowserTabsState(activeTarget.id);
  const activeBrowserTabId = activeBrowserTabsState.activeTabId;
  const activeTerminalTabsState = getTerminalTabsState(activeTarget.id);
  const activeTerminalTabId = activeTerminalTabsState.activeTabId;

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
    if (activePaneId !== 'codex') {
      return;
    }

    composerRef.current?.focus();
  }, [activePaneId, activeTarget.id]);

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
    let isDisposed = false;

    setRepoSuggestedPrompts(null);

    void window.electronAPI.getRepoConfig(repoPath)
      .then((config) => {
        if (!isDisposed) {
          setRepoSuggestedPrompts(config.suggestedPrompts);
        }
      })
      .catch((error) => {
        console.error('Failed to load repo config:', error);

        if (!isDisposed) {
          setRepoSuggestedPrompts(undefined);
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [repoPath]);

  useEffect(() => {
    pruneBrowserTabs(targets.map((target) => target.id));
  }, [pruneBrowserTabs, targets]);

  useEffect(() => {
    pruneTerminalTabs(targets.map((target) => target.id));
  }, [pruneTerminalTabs, targets]);

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

  const composerSettings = preferences.codexComposerSettings;

  const handleComposerSettingsChange = useCallback((settings: CodexComposerSettings) => {
    setCodexComposerSettings(settings);
  }, [setCodexComposerSettings]);

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

  const handleImplementPlan = useCallback((planMarkdown: string) => {
    void handleSendPrompt({
      prompt: buildPlanImplementationPrompt(planMarkdown),
      settings: {
        ...composerSettings,
        interactionMode: 'default',
      },
      attachments: [],
    });
  }, [composerSettings, handleSendPrompt]);

  const handleCreateWorktree = async () => {
    setIsCreatingWorktree(true);

    try {
      const result = await window.electronAPI.createGitWorktree(repoPath);
      const target = addWorktreeTarget(result.cwd, result.initialTitle);

      rememberActiveTarget(target.id);

      if (result.worktreeSetupCommand) {
        void window.electronAPI.execTerminalSessionCommand({
          sessionId: getDefaultTerminalTabId(target.id),
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
    const nextActiveTargetId = wasActive
      ? getCodeTargetIdAfterClose(targets, target.id)
      : null;

    removeTarget(target.id);

    if (nextActiveTargetId !== null) {
      rememberActiveTarget(nextActiveTargetId);
    }
  }, [
    rememberActiveTarget,
    removeTarget,
    targets,
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
    const terminalTabs = getTerminalTabsState(target.id).tabs;

    await stopSession(target.id);
    await Promise.all(
      terminalTabs.map((tab) => window.electronAPI.closeTerminalSession(tab.id)),
    );
    await window.electronAPI.disposeBrowserTarget(target.id);
    clearCodeTargetBrowserState(target.id);
    removeBrowserTabState(target.id);
    removeTerminalTabState(target.id);
    clearComposerDraft(target.id);
  }, [clearComposerDraft, getTerminalTabsState, removeBrowserTabState, removeTerminalTabState, stopSession]);

  const removeClosedWorktree = useCallback(async (
    target: CodeTarget,
    wasActive: boolean,
    force: boolean,
  ) => {
    let worktreeRemoved = false;
    const terminalTabs = getTerminalTabsState(target.id).tabs;

    try {
      await Promise.all(
        terminalTabs.map((tab) => window.electronAPI.closeTerminalSession(tab.id)),
      );
      await window.electronAPI.removeGitWorktree(repoPath, target.cwd, force);
      worktreeRemoved = true;
      await window.electronAPI.disposeBrowserTarget(target.id);
      clearCodeTargetBrowserState(target.id);
      await stopSession(target.id);
      removeBrowserTabState(target.id);
      removeTerminalTabState(target.id);
      clearComposerDraft(target.id);
    } catch (error) {
      console.error('Failed to remove worktree:', error);

      if (!worktreeRemoved) {
        restoreTargetInUi(target, wasActive);
      }
    }
  }, [
    getTerminalTabsState,
    removeBrowserTabState,
    removeTerminalTabState,
    repoPath,
    restoreTargetInUi,
    stopSession,
    clearComposerDraft,
  ]);

  const handleRemoveTarget = useCallback(async (targetId: string, skipDraftConfirmation = false) => {
    const target = targets.find((candidate) => candidate.id === targetId);

    if (!target || target.kind === 'root') {
      return;
    }

    if (
      !skipDraftConfirmation &&
      isComposerDraftDirty(composerDrafts[target.id] ?? { prompt: '', attachments: [] })
    ) {
      setPendingDraftTargetClose({ target });
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
    composerDrafts,
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

  const handleResetSession = useCallback(async (targetId: string) => {
    await resetSession(targetId);
    clearComposerDraft(targetId);
  }, [clearComposerDraft, resetSession]);

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
    composerRef.current?.appendPromptBlock(
      formatAnchoredDiffCommentPrompt({
        filepath: anchor.path,
        lineStart: anchor.startLine,
        lineEnd: anchor.endLine,
        comment: body,
      }),
    );
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'n' && event.metaKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        void handleResetSession(activeTarget.id);
      }

      if (event.key === 'Escape' && sessionState.status === 'running') {
        event.preventDefault();
        void interruptSession(activeTarget.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTarget.id, handleResetSession, interruptSession, sessionState.status]);

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
  const handleAddBrowserTab = useCallback(() => {
    addBrowserTab(activeTarget.id);
  }, [activeTarget.id, addBrowserTab]);
  const handleActiveBrowserTabChange = useCallback((tabId: string) => {
    setActiveBrowserTab(activeTarget.id, tabId);
  }, [activeTarget.id, setActiveBrowserTab]);
  const handleCloseBrowserTab = useCallback((tabId: string) => {
    if (!closeBrowserTab(activeTarget.id, tabId)) {
      return;
    }

    clearBrowserViewState(tabId);
    void window.electronAPI.disposeBrowserView(tabId).catch((error) => {
      console.error('Failed to close browser tab:', error);
    });
  }, [activeTarget.id, closeBrowserTab]);
  const handleAddTerminalTab = useCallback(() => {
    addTerminalTab(activeTarget.id);
  }, [activeTarget.id, addTerminalTab]);
  const handleActiveTerminalTabChange = useCallback((tabId: string) => {
    setActiveTerminalTab(activeTarget.id, tabId);
  }, [activeTarget.id, setActiveTerminalTab]);
  const handleCloseTerminalTab = useCallback((tabId: string) => {
    if (!closeTerminalTab(activeTarget.id, tabId)) {
      return;
    }

    void window.electronAPI.closeTerminalSession(tabId).catch((error) => {
      console.error('Failed to close terminal tab:', error);
    });
  }, [activeTarget.id, closeTerminalTab]);
  const handleRenameTerminalTab = useCallback((tabId: string, title: string) => {
    renameTerminalTab(activeTarget.id, tabId, title);
  }, [activeTarget.id, renameTerminalTab]);
  const handleAppShortcutCommand = useEffectEvent((command: AppShortcutCommand) => {
    if (pendingDraftTargetClose !== null || pendingWorktreeRemoval !== null || isRemovingWorktree) {
      return;
    }

    if (command.type === 'cycle-code-target-tab') {
      const nextTargetId = getAdjacentCodeTargetId(targets, activeTargetId, command.direction);

      if (nextTargetId !== null) {
        rememberActiveTarget(nextTargetId);
      }

      return;
    }

    if (command.type === 'cycle-code-pane') {
      rememberActivePane(getAdjacentCodePaneId(activePaneId, command.direction));
      return;
    }

    if (command.type === 'create-code-session') {
      handleAddCurrentBranchSession();
      return;
    }

    if (command.type === 'close-current-tab' && activeTarget.kind !== 'root') {
      void handleRemoveTarget(activeTarget.id);
    }
  });

  useAppShortcutCommand((command) => {
    handleAppShortcutCommand(command);
  });

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
        <div>
          <LayerToggle
            activePaneId={activePaneId}
            onChangePane={rememberActivePane}
            codexMenu={(
              <CodexTabMenu
                cwd={activeTarget.cwd}
                currentThreadId={sessionState.threadId}
                settings={composerSettings}
                onSettingsChange={handleComposerSettingsChange}
                onNewSession={() => {
                  void handleResetSession(activeTarget.id);
                }}
                onSelectThread={(threadId) =>
                  resumeThread(activeTarget.id, activeTarget.cwd, composerSettings, threadId)
                }
              />
            )}
          />
        </div>

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
                <TargetBrowserPanel
                  key={activeTarget.id}
                  codeTargetId={activeTarget.id}
                  tabs={activeBrowserTabsState.tabs}
                  activeTabId={activeBrowserTabId}
                  onAddTab={handleAddBrowserTab}
                  onChangeTab={handleActiveBrowserTabChange}
                  onCloseTab={handleCloseBrowserTab}
                />
              ) : activePaneId === 'terminal' ? (
                <TargetTerminalPanel
                  key={activeTarget.id}
                  cwd={activeTarget.cwd}
                  tabs={activeTerminalTabsState.tabs}
                  activeTabId={activeTerminalTabId}
                  onAddTab={handleAddTerminalTab}
                  onChangeTab={handleActiveTerminalTabChange}
                  onCloseTab={handleCloseTerminalTab}
                  onRenameTab={handleRenameTerminalTab}
                />
              ) : (
                <SessionTranscript
                  sessionState={sessionState}
                  repoPath={activeTarget.cwd}
                  targetLabel={activeTargetLabel}
                  suggestedPrompts={repoSuggestedPrompts}
                  externalEditorPreference={preferences.externalEditor}
                  onExternalEditorPreferenceChange={setExternalEditorPreference}
                  onRequestConfigureExternalEditor={() => setIsExternalEditorDialogOpen(true)}
                  onImplementPlan={handleImplementPlan}
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
          <LivePlanDock activePlan={sessionState.activePlan} isRunning={isRunning} />

          <SessionAlerts
            targetId={activeTarget.id}
            sessionError={sessionState.error}
            pendingApprovals={sessionState.pendingApprovals}
            pendingUserInputs={sessionState.pendingUserInputs}
            onRespondToApproval={respondToApproval}
            onRespondToUserInput={respondToUserInput}
            onDismissUserInput={() => interruptSession(activeTarget.id)}
          />

          <ChatComposer
            key={activeTarget.id}
            ref={composerRef}
            targetId={activeTarget.id}
            activeRepoPath={activeTarget.cwd}
            storedRepoPaths={storedRepoPaths}
            settings={composerSettings}
            isRunning={isRunning}
            tokenUsage={sessionState.tokenUsage}
            onSendPrompt={handleSendPrompt}
            onInterrupt={() => interruptSession(activeTarget.id)}
          />
        </div>
      </div>
    </>
  ), [
    activePaneId,
    activeBrowserTabId,
    activeBrowserTabsState.tabs,
    activeTerminalTabId,
    activeTerminalTabsState.tabs,
    activeTarget.cwd,
    activeTarget.id,
    activeTargetLabel,
    handleActiveBrowserTabChange,
    handleAddBrowserTab,
    handleActiveTerminalTabChange,
    handleAddTerminalTab,
    composerSettings,
    handleComposerSettingsChange,
    handleCloseBrowserTab,
    handleCloseTerminalTab,
    handleImplementPlan,
    handleRenameTerminalTab,
    handleResetSession,
    handleSendPrompt,
    handleSidebarResize,
    interruptSession,
    isRunning,
    rememberActivePane,
    respondToApproval,
    respondToUserInput,
    resumeThread,
    sessionState.activePlan,
    sessionState.error,
    sessionState.pendingApprovals,
    sessionState.pendingUserInputs,
    sessionState.threadId,
    sessionState.tokenUsage,
    sidebarWidth,
    storedRepoPaths,
  ]);

  return (
    <>
      <Dialog
        open={pendingDraftTargetClose !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPendingDraftTargetClose(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard unsent draft?</DialogTitle>
            <DialogDescription>
              {pendingDraftTargetClose === null
                ? ''
                : `Closing ${pendingDraftTargetClose.target.title} will discard the unsent text and images in its composer.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDraftTargetClose(null)}
            >
              Keep draft
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (pendingDraftTargetClose === null) {
                  return;
                }

                const { target } = pendingDraftTargetClose;
                setPendingDraftTargetClose(null);
                void handleRemoveTarget(target.id, true);
              }}
            >
              Discard and close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <ExternalEditorDialog
        open={isExternalEditorDialogOpen}
        onOpenChange={setIsExternalEditorDialogOpen}
        preference={preferences.externalEditor}
        onSave={setExternalEditorPreference}
      />

      <div className="flex h-full min-h-0 flex-col">
      <Tabs className="gap-0" value={activeTargetId} onValueChange={handleActiveTargetChange}>
        <div
          className="flex items-center gap-1 border-b border-border bg-muted/20 px-2 py-1.5"
        >
          <Reorder.Group
            axis="x"
            values={targets}
            onReorder={reorderTargets}
            className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
            as="div"
          >
            <AnimatePresence initial={false}>
              {targets.map((target) => {
                const isActive = activeTargetId === target.id;
                const label = targetLabels[target.id] ?? target.title;
                const hasDirtyDraft = isComposerDraftDirty(
                  composerDrafts[target.id] ?? { prompt: '', attachments: [] },
                );

                return (
                  <Reorder.Item
                    key={target.id}
                    value={target}
                    onClick={() => handleActiveTargetChange(target.id)}
                    drag={target.kind !== 'root'}
                    initial={{ opacity: 0, width: 0 }}
                    animate={{
                      opacity: 1,
                      width: 'auto',
                      transition: { type: 'spring', bounce: 0, duration: 0.2 },
                    }}
                    exit={{
                      opacity: 0,
                      width: 0,
                      transition: { type: 'tween', ease: 'easeOut', duration: 0.2 },
                    }}
                    layout
                    className={cn(
                      'group/tab relative flex max-w-[16rem] shrink-0 cursor-default items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors',
                      isActive
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-background/50 hover:text-foreground/80',
                      hasDirtyDraft && !isActive ? 'ring-1 ring-inset ring-amber-500/35' : null,
                    )}
                    as="div"
                    whileDrag={{ scale: 1.03, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
                  >
                    {target.kind === 'worktree' ? (
                      <GitBranchPlusIcon className="size-3 shrink-0 text-muted-foreground/60" />
                    ) : null}
                    <span className="truncate select-none whitespace-nowrap">{label}</span>
                    {target.kind !== 'root' ? (
                      <button
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleRemoveTarget(target.id);
                        }}
                        className={cn(
                          'flex shrink-0 items-center justify-center rounded transition-all hover:bg-muted',
                          isActive
                            ? 'ml-0.5 size-4 opacity-60 hover:opacity-100'
                            : 'size-0 overflow-hidden opacity-0 group-hover/tab:ml-0.5 group-hover/tab:size-4 group-hover/tab:opacity-60 group-hover/tab:hover:opacity-100',
                        )}
                        aria-keyshortcuts="Meta+W"
                        aria-label={target.kind === 'worktree' ? `Remove worktree ${target.title}` : `Close session ${target.title}`}
                        type="button"
                      >
                        <XIcon className="size-2.5" />
                      </button>
                    ) : null}
                  </Reorder.Item>
                );
              })}
            </AnimatePresence>
          </Reorder.Group>

          <div className="flex shrink-0 items-center gap-0.5 border-l border-border/40 pl-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleAddCurrentBranchSession}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-background/50 hover:text-muted-foreground"
                    aria-label="New session on current branch"
                  >
                    <PlusIcon className="size-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>New session on {rootBranch}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleCreateWorktree}
                    disabled={isCreatingWorktree}
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-background/50 hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-40"
                    aria-label="New worktree"
                  >
                    {isCreatingWorktree ? (
                      <LoaderCircleIcon className="size-3 animate-spin" />
                    ) : (
                      <GitBranchPlusIcon className="size-3" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{`New worktree from ${worktreeBaseBranchLabel}`}</TooltipContent>
              </Tooltip>

            </TooltipProvider>
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
            codexSessionState={{
              status: sessionState.status,
              threadId: sessionState.threadId,
              transcriptEntries: sessionState.transcriptEntries,
              model: composerSettings.model,
              reasoningEffort: composerSettings.reasoningEffort,
            }}
            workingTreeFiles={visibleChangesStatus.files}
            workingTreeStatusRefreshVersion={statusState.refreshVersion}
            isViewportActive={activePaneId === 'changes'}
            onFileSelect={() => rememberActivePane('changes')}
            onSubmitDiffComment={(anchor, body) => handleSubmitDiffComment(anchor, body)}
            externalEditorPreference={preferences.externalEditor}
            onExternalEditorPreferenceChange={setExternalEditorPreference}
            onRequestConfigureExternalEditor={() => setIsExternalEditorDialogOpen(true)}
          >
            {({ sidebar, viewport }) => renderWorkspaceLayout(sidebar, viewport)}
          </ChangesPane>
        )}
      </div>
      </div>
    </>
  );
}
