import { ipcRenderer } from 'electron';

import {
  APP_SHORTCUT_COMMAND_CHANNEL,
  AppShortcutCommandSchema,
  CODEX_SESSION_EVENT_CHANNEL,
  CodexSessionEventSchema,
  GET_APP_BOOTSTRAP_CHANNEL,
  GET_PROJECT_ISSUES_CHANNEL,
  GET_PROJECT_PULL_REQUESTS_CHANNEL,
  GET_GITHUB_REPO_DETAILS_CHANNEL,
  FIND_LOCAL_GITHUB_REPO_CHANNEL,
  PICK_REPO_DIRECTORY_CHANNEL,
  VALIDATE_LOCAL_GIT_REPO_CHANNEL,
  CLONE_GITHUB_REPO_CHANNEL,
  CLONE_GITHUB_REPO_PROGRESS_CHANNEL,
  GET_GIT_BRANCHES_CHANNEL,
  GET_GIT_DEFAULT_BRANCH_CHANNEL,
  GET_GIT_BRANCH_HISTORY_CHANNEL,
  GIT_STATE_CHANGED_CHANNEL,
  GET_GIT_BRANCH_COMPARE_META_CHANNEL,
  GET_GIT_BRANCH_COMPARE_DIFF_CHANNEL,
  GET_GIT_STATUS_CHANNEL,
  GET_GIT_WORKING_TREE_DIFF_CHANNEL,
  CHECKOUT_GIT_BRANCH_CHANNEL,
  GET_GIT_FILE_DIFF_CHANNEL,
  CREATE_GIT_WORKTREE_CHANNEL,
  COMMIT_WORKING_TREE_SELECTION_CHANNEL,
  CREATE_GITHUB_PR_REVIEW_THREAD_CHANNEL,
  PROMOTE_GIT_WORKTREE_BRANCH_CHANNEL,
  GENERATE_PR_REVIEW_CHANNEL,
  SYNC_REPO_REVIEW_REFS_CHANNEL,
  GET_PR_DIFF_META_CHANNEL,
  GET_COMMIT_DIFF_CHANNEL,
  GET_PR_DIFF_CHANNEL,
  GET_GIT_BLOB_TEXT_CHANNEL,
  GET_WORKING_TREE_FILE_TEXT_CHANNEL,
  GET_COMMIT_PARENT_CHANNEL,
  GitStateChangedEventSchema,
  LIST_CODEX_THREADS_CHANNEL,
  RESUME_CODEX_THREAD_CHANNEL,
  START_GIT_STATE_WATCH_CHANNEL,
  STOP_GIT_STATE_WATCH_CHANNEL,
  INTERRUPT_CODEX_SESSION_CHANNEL,
  RESPOND_TO_CODEX_APPROVAL_CHANNEL,
  RESPOND_TO_CODEX_USER_INPUT_CHANNEL,
  SEND_CODEX_SESSION_PROMPT_CHANNEL,
  SEARCH_CODEX_PATHS_CHANNEL,
  STOP_CODEX_SESSION_CHANNEL,
  OPEN_TERMINAL_SESSION_CHANNEL,
  WRITE_TERMINAL_SESSION_CHANNEL,
  RESIZE_TERMINAL_SESSION_CHANNEL,
  CLOSE_TERMINAL_SESSION_CHANNEL,
  TERMINAL_SESSION_EVENT_CHANNEL,
  TerminalSessionEventSchema,
  type ElectronApi,
} from '@/ipc/contracts';

export const electronApi: ElectronApi = {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
  getAppBootstrap: () => ipcRenderer.invoke(GET_APP_BOOTSTRAP_CHANNEL),
  pickRepoDirectory: () => ipcRenderer.invoke(PICK_REPO_DIRECTORY_CHANNEL),
  getProjectIssues: (owner, name, skipCache) =>
    ipcRenderer.invoke(GET_PROJECT_ISSUES_CHANNEL, owner, name, skipCache),
  getProjectPullRequests: (owner, name, skipCache) =>
    ipcRenderer.invoke(GET_PROJECT_PULL_REQUESTS_CHANNEL, owner, name, skipCache),
  validateLocalGitRepository: (directoryPath) =>
    ipcRenderer.invoke(VALIDATE_LOCAL_GIT_REPO_CHANNEL, directoryPath),
  getGithubRepoDetails: (projectPath) =>
    ipcRenderer.invoke(GET_GITHUB_REPO_DETAILS_CHANNEL, projectPath),
  findLocalGithubRepoPath: (slug) =>
    ipcRenderer.invoke(FIND_LOCAL_GITHUB_REPO_CHANNEL, slug),
  cloneGithubRepo: (slug) =>
    ipcRenderer.invoke(CLONE_GITHUB_REPO_CHANNEL, slug),
  onCloneProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, line: unknown) => {
      if (typeof line === 'string') {
        listener(line);
      }
    };

    ipcRenderer.on(CLONE_GITHUB_REPO_PROGRESS_CHANNEL, handler);

    return () => {
      ipcRenderer.removeListener(CLONE_GITHUB_REPO_PROGRESS_CHANNEL, handler);
    };
  },
  getGitBranches: (repoPath) =>
    ipcRenderer.invoke(GET_GIT_BRANCHES_CHANNEL, repoPath),
  getGitDefaultBranch: (repoPath) =>
    ipcRenderer.invoke(GET_GIT_DEFAULT_BRANCH_CHANNEL, repoPath),
  getGitBranchHistory: (repoPath, branchName) =>
    ipcRenderer.invoke(GET_GIT_BRANCH_HISTORY_CHANNEL, repoPath, branchName),
  startGitStateWatch: (repoPath) =>
    ipcRenderer.invoke(START_GIT_STATE_WATCH_CHANNEL, repoPath),
  stopGitStateWatch: (subscriptionId) =>
    ipcRenderer.invoke(STOP_GIT_STATE_WATCH_CHANNEL, subscriptionId),
  getGitBranchCompareMeta: (repoPath, baseBranch, headBranch) =>
    ipcRenderer.invoke(
      GET_GIT_BRANCH_COMPARE_META_CHANNEL,
      repoPath,
      baseBranch,
      headBranch,
    ),
  getGitBranchCompareDiff: (repoPath, baseBranch, headBranch) =>
    ipcRenderer.invoke(
      GET_GIT_BRANCH_COMPARE_DIFF_CHANNEL,
      repoPath,
      baseBranch,
      headBranch,
    ),
  getGitStatus: (repoPath) =>
    ipcRenderer.invoke(GET_GIT_STATUS_CHANNEL, repoPath),
  getGitWorkingTreeDiff: (repoPath) =>
    ipcRenderer.invoke(GET_GIT_WORKING_TREE_DIFF_CHANNEL, repoPath),
  checkoutGitBranch: (repoPath, branchName) =>
    ipcRenderer.invoke(CHECKOUT_GIT_BRANCH_CHANNEL, repoPath, branchName),
  getGitFileDiff: (repoPath, filePath) =>
    ipcRenderer.invoke(GET_GIT_FILE_DIFF_CHANNEL, repoPath, filePath),
  createGitWorktree: (repoPath, baseBranch) =>
    ipcRenderer.invoke(CREATE_GIT_WORKTREE_CHANNEL, repoPath, baseBranch),
  promoteGitWorktreeBranch: (repoPath, currentBranch, prompt) =>
    ipcRenderer.invoke(
      PROMOTE_GIT_WORKTREE_BRANCH_CHANNEL,
      repoPath,
      currentBranch,
      prompt,
    ),
  commitWorkingTreeSelection: (input) =>
    ipcRenderer.invoke(COMMIT_WORKING_TREE_SELECTION_CHANNEL, input),
  generatePrReview: (repoPath, prNumber, title) =>
    ipcRenderer.invoke(GENERATE_PR_REVIEW_CHANNEL, repoPath, prNumber, title),
  getPrDiffMeta: (repoPath, prNumber) =>
    ipcRenderer.invoke(GET_PR_DIFF_META_CHANNEL, repoPath, prNumber),
  syncRepoReviewRefs: (repoPath, owner, name) =>
    ipcRenderer.invoke(SYNC_REPO_REVIEW_REFS_CHANNEL, repoPath, owner, name),
  createGitHubPrReviewThread: (input) =>
    ipcRenderer.invoke(CREATE_GITHUB_PR_REVIEW_THREAD_CHANNEL, input),
  getCommitDiff: (repoPath, commitSha) =>
    ipcRenderer.invoke(GET_COMMIT_DIFF_CHANNEL, repoPath, commitSha),
  getPrDiff: (repoPath, prNumber) =>
    ipcRenderer.invoke(GET_PR_DIFF_CHANNEL, repoPath, prNumber),
  getGitBlobText: (input) =>
    ipcRenderer.invoke(GET_GIT_BLOB_TEXT_CHANNEL, input),
  getWorkingTreeFileText: (input) =>
    ipcRenderer.invoke(GET_WORKING_TREE_FILE_TEXT_CHANNEL, input),
  getCommitParent: (repoPath, commitSha) =>
    ipcRenderer.invoke(GET_COMMIT_PARENT_CHANNEL, repoPath, commitSha),
  sendCodexSessionPrompt: (input) =>
    ipcRenderer.invoke(SEND_CODEX_SESSION_PROMPT_CHANNEL, input),
  listCodexThreads: (input) =>
    ipcRenderer.invoke(LIST_CODEX_THREADS_CHANNEL, input),
  resumeCodexThread: (input) =>
    ipcRenderer.invoke(RESUME_CODEX_THREAD_CHANNEL, input),
  searchCodexPaths: (input) =>
    ipcRenderer.invoke(SEARCH_CODEX_PATHS_CHANNEL, input),
  interruptCodexSession: (sessionId) =>
    ipcRenderer.invoke(INTERRUPT_CODEX_SESSION_CHANNEL, sessionId),
  stopCodexSession: (sessionId) =>
    ipcRenderer.invoke(STOP_CODEX_SESSION_CHANNEL, sessionId),
  respondToCodexApproval: (input) =>
    ipcRenderer.invoke(RESPOND_TO_CODEX_APPROVAL_CHANNEL, input),
  respondToCodexUserInput: (input) =>
    ipcRenderer.invoke(RESPOND_TO_CODEX_USER_INPUT_CHANNEL, input),
  openTerminalSession: (input) =>
    ipcRenderer.invoke(OPEN_TERMINAL_SESSION_CHANNEL, input),
  writeTerminalSession: (input) =>
    ipcRenderer.invoke(WRITE_TERMINAL_SESSION_CHANNEL, input),
  resizeTerminalSession: (input) =>
    ipcRenderer.invoke(RESIZE_TERMINAL_SESSION_CHANNEL, input),
  closeTerminalSession: (sessionId) =>
    ipcRenderer.invoke(CLOSE_TERMINAL_SESSION_CHANNEL, sessionId),
  onGitStateChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, event: unknown) => {
      const parsedEvent = GitStateChangedEventSchema.safeParse(event);

      if (!parsedEvent.success) {
        return;
      }

      listener(parsedEvent.data);
    };

    ipcRenderer.on(GIT_STATE_CHANGED_CHANNEL, handler);

    return () => {
      ipcRenderer.removeListener(GIT_STATE_CHANGED_CHANNEL, handler);
    };
  },
  onCodexSessionEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, event: unknown) => {
      const parsedEvent = CodexSessionEventSchema.safeParse(event);

      if (!parsedEvent.success) {
        return;
      }

      listener(parsedEvent.data);
    };

    ipcRenderer.on(CODEX_SESSION_EVENT_CHANNEL, handler);

    return () => {
      ipcRenderer.removeListener(CODEX_SESSION_EVENT_CHANNEL, handler);
    };
  },
  onTerminalSessionEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, event: unknown) => {
      const parsedEvent = TerminalSessionEventSchema.safeParse(event);

      if (!parsedEvent.success) {
        return;
      }

      listener(parsedEvent.data);
    };

    ipcRenderer.on(TERMINAL_SESSION_EVENT_CHANNEL, handler);

    return () => {
      ipcRenderer.removeListener(TERMINAL_SESSION_EVENT_CHANNEL, handler);
    };
  },
  onAppShortcutCommand: (listener) => {
    const handleShortcutCommand = (
      _event: Electron.IpcRendererEvent,
      command: unknown,
    ) => {
      const parsedCommand = AppShortcutCommandSchema.safeParse(command);

      if (!parsedCommand.success) {
        return;
      }

      listener(parsedCommand.data);
    };

    ipcRenderer.on(APP_SHORTCUT_COMMAND_CHANNEL, handleShortcutCommand);

    return () => {
      ipcRenderer.removeListener(
        APP_SHORTCUT_COMMAND_CHANNEL,
        handleShortcutCommand,
      );
    };
  },
};
