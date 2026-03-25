import { ipcRenderer } from 'electron';

import {
  APP_SHORTCUT_COMMAND_CHANNEL,
  AppShortcutCommandSchema,
  CODEX_SESSION_EVENT_CHANNEL,
  CodexSessionEventSchema,
  DesktopUpdateStateSchema,
  DOWNLOAD_UPDATE_CHANNEL,
  GET_APP_BOOTSTRAP_CHANNEL,
  GET_UPDATE_STATE_CHANNEL,
  GET_GITHUB_REPO_DETAILS_CHANNEL,
  GET_REMOTE_REPO_README_CHANNEL,
  GET_GITHUB_REPO_OVERVIEW_CHANNEL,
  GET_REPO_CONFIG_CHANNEL,
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
  SUGGEST_GIT_WORKTREE_BRANCH_NAME_CHANNEL,
  CREATE_GIT_BRANCH_CHANNEL,
  CHECK_GIT_WORKTREE_REMOVAL_CHANNEL,
  REMOVE_GIT_WORKTREE_CHANNEL,
  COMMIT_WORKING_TREE_SELECTION_CHANNEL,
  GET_COMMIT_DIFF_CHANNEL,
  GET_GIT_PROMPT_REQUEST_ASSET_DATA_URL_CHANNEL,
  GET_GIT_BLOB_TEXT_CHANNEL,
  GET_WORKING_TREE_FILE_TEXT_CHANNEL,
  GET_COMMIT_PARENT_CHANNEL,
  GET_REPO_EXTENSIONS_CHANNEL,
  INSTALL_REPO_EXTENSION_CHANNEL,
  INSTALL_REPO_EXTENSION_VERSION_CHANNEL,
  LIST_EXTENSION_VERSIONS_CHANNEL,
  RUN_EXTENSION_COMMAND_CHANNEL,
  LIST_AVAILABLE_EXTERNAL_EDITORS_CHANNEL,
  PICK_EXTERNAL_EDITOR_PATH_CHANNEL,
  VALIDATE_EXTERNAL_EDITOR_PATH_CHANNEL,
  OPEN_FILE_IN_EXTERNAL_EDITOR_CHANNEL,
  INSTALL_UPDATE_CHANNEL,
  PERSIST_CODEX_ATTACHMENTS_CHANNEL,
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
  EXEC_TERMINAL_SESSION_COMMAND_CHANNEL,
  WRITE_TERMINAL_SESSION_CHANNEL,
  RESIZE_TERMINAL_SESSION_CHANNEL,
  CLOSE_TERMINAL_SESSION_CHANNEL,
  TERMINAL_SESSION_EVENT_CHANNEL,
  TerminalSessionEventSchema,
  BROWSER_VIEW_EVENT_CHANNEL,
  BrowserViewEventSchema,
  CLOSE_CURRENT_WINDOW_CHANNEL,
  GET_CODEX_PROMPT_REQUEST_CHECKPOINT_CHANNEL,
  SHOW_BROWSER_VIEW_CHANNEL,
  HIDE_BROWSER_VIEW_CHANNEL,
  UPDATE_BROWSER_VIEW_BOUNDS_CHANNEL,
  UPDATE_STATE_CHANNEL,
  NAVIGATE_BROWSER_VIEW_CHANNEL,
  GO_BACK_BROWSER_VIEW_CHANNEL,
  GO_FORWARD_BROWSER_VIEW_CHANNEL,
  RELOAD_BROWSER_VIEW_CHANNEL,
  OPEN_BROWSER_VIEW_DEVTOOLS_CHANNEL,
  DISPOSE_BROWSER_VIEW_CHANNEL,
  DISPOSE_BROWSER_TARGET_CHANNEL,
  GET_GIT_BRANCH_PROMPT_REQUESTS_CHANNEL,
  WRITE_GIT_PROMPT_REQUEST_NOTE_CHANNEL,
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
  getUpdateState: () => ipcRenderer.invoke(GET_UPDATE_STATE_CHANNEL),
  downloadUpdate: () => ipcRenderer.invoke(DOWNLOAD_UPDATE_CHANNEL),
  installUpdate: () => ipcRenderer.invoke(INSTALL_UPDATE_CHANNEL),
  onUpdateState: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: unknown) => {
      const parsedState = DesktopUpdateStateSchema.safeParse(state);

      if (!parsedState.success) {
        return;
      }

      listener(parsedState.data);
    };

    ipcRenderer.on(UPDATE_STATE_CHANNEL, handler);

    return () => {
      ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, handler);
    };
  },
  pickRepoDirectory: () => ipcRenderer.invoke(PICK_REPO_DIRECTORY_CHANNEL),
  closeCurrentWindow: () => ipcRenderer.invoke(CLOSE_CURRENT_WINDOW_CHANNEL),
  validateLocalGitRepository: (directoryPath) =>
    ipcRenderer.invoke(VALIDATE_LOCAL_GIT_REPO_CHANNEL, directoryPath),
  getGithubRepoDetails: (projectPath) =>
    ipcRenderer.invoke(GET_GITHUB_REPO_DETAILS_CHANNEL, projectPath),
  getRemoteRepoReadme: (slug) =>
    ipcRenderer.invoke(GET_REMOTE_REPO_README_CHANNEL, slug),
  getGithubRepoOverview: (slug) =>
    ipcRenderer.invoke(GET_GITHUB_REPO_OVERVIEW_CHANNEL, slug),
  getRepoConfig: (repoPath) =>
    ipcRenderer.invoke(GET_REPO_CONFIG_CHANNEL, repoPath),
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
  getGitBranchPromptRequests: (input) =>
    ipcRenderer.invoke(GET_GIT_BRANCH_PROMPT_REQUESTS_CHANNEL, input),
  getGitStatus: (repoPath) =>
    ipcRenderer.invoke(GET_GIT_STATUS_CHANNEL, repoPath),
  getGitWorkingTreeDiff: (repoPath) =>
    ipcRenderer.invoke(GET_GIT_WORKING_TREE_DIFF_CHANNEL, repoPath),
  checkoutGitBranch: (repoPath, branchName) =>
    ipcRenderer.invoke(CHECKOUT_GIT_BRANCH_CHANNEL, repoPath, branchName),
  getGitFileDiff: (repoPath, filePath) =>
    ipcRenderer.invoke(GET_GIT_FILE_DIFF_CHANNEL, repoPath, filePath),
  createGitWorktree: (repoPath) =>
    ipcRenderer.invoke(CREATE_GIT_WORKTREE_CHANNEL, repoPath),
  suggestGitWorktreeBranchName: (repoPath, prompt) =>
    ipcRenderer.invoke(SUGGEST_GIT_WORKTREE_BRANCH_NAME_CHANNEL, repoPath, prompt),
  createGitBranch: (repoPath, branchName) =>
    ipcRenderer.invoke(CREATE_GIT_BRANCH_CHANNEL, repoPath, branchName),
  checkGitWorktreeRemoval: (repoPath, worktreePath) =>
    ipcRenderer.invoke(CHECK_GIT_WORKTREE_REMOVAL_CHANNEL, repoPath, worktreePath),
  removeGitWorktree: (repoPath, worktreePath, force) =>
    ipcRenderer.invoke(REMOVE_GIT_WORKTREE_CHANNEL, repoPath, worktreePath, force),
  commitWorkingTreeSelection: (input) =>
    ipcRenderer.invoke(COMMIT_WORKING_TREE_SELECTION_CHANNEL, input),
  getCodexPromptRequestCheckpoint: (input) =>
    ipcRenderer.invoke(GET_CODEX_PROMPT_REQUEST_CHECKPOINT_CHANNEL, input),
  writeGitPromptRequestNote: (input) =>
    ipcRenderer.invoke(WRITE_GIT_PROMPT_REQUEST_NOTE_CHANNEL, input),
  getCommitDiff: (repoPath, commitSha) =>
    ipcRenderer.invoke(GET_COMMIT_DIFF_CHANNEL, repoPath, commitSha),
  getGitPromptRequestAssetDataUrl: (input) =>
    ipcRenderer.invoke(GET_GIT_PROMPT_REQUEST_ASSET_DATA_URL_CHANNEL, input),
  getGitBlobText: (input) =>
    ipcRenderer.invoke(GET_GIT_BLOB_TEXT_CHANNEL, input),
  getWorkingTreeFileText: (input) =>
    ipcRenderer.invoke(GET_WORKING_TREE_FILE_TEXT_CHANNEL, input),
  getCommitParent: (repoPath, commitSha) =>
    ipcRenderer.invoke(GET_COMMIT_PARENT_CHANNEL, repoPath, commitSha),
  getRepoExtensions: (repoPath) =>
    ipcRenderer.invoke(GET_REPO_EXTENSIONS_CHANNEL, repoPath),
  installRepoExtension: (input) =>
    ipcRenderer.invoke(INSTALL_REPO_EXTENSION_CHANNEL, input),
  installRepoExtensionVersion: (input) =>
    ipcRenderer.invoke(INSTALL_REPO_EXTENSION_VERSION_CHANNEL, input),
  listExtensionVersions: (repoPath, extensionId) =>
    ipcRenderer.invoke(LIST_EXTENSION_VERSIONS_CHANNEL, repoPath, extensionId),
  runExtensionCommand: (input) =>
    ipcRenderer.invoke(RUN_EXTENSION_COMMAND_CHANNEL, input),
  listAvailableExternalEditors: () =>
    ipcRenderer.invoke(LIST_AVAILABLE_EXTERNAL_EDITORS_CHANNEL),
  pickExternalEditorPath: () =>
    ipcRenderer.invoke(PICK_EXTERNAL_EDITOR_PATH_CHANNEL),
  validateExternalEditorPath: (editorPath) =>
    ipcRenderer.invoke(VALIDATE_EXTERNAL_EDITOR_PATH_CHANNEL, editorPath),
  openFileInExternalEditor: (input) =>
    ipcRenderer.invoke(OPEN_FILE_IN_EXTERNAL_EDITOR_CHANNEL, input),
  persistCodexAttachments: (input) =>
    ipcRenderer.invoke(PERSIST_CODEX_ATTACHMENTS_CHANNEL, input),
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
  execTerminalSessionCommand: (input) =>
    ipcRenderer.invoke(EXEC_TERMINAL_SESSION_COMMAND_CHANNEL, input),
  writeTerminalSession: (input) =>
    ipcRenderer.invoke(WRITE_TERMINAL_SESSION_CHANNEL, input),
  resizeTerminalSession: (input) =>
    ipcRenderer.invoke(RESIZE_TERMINAL_SESSION_CHANNEL, input),
  closeTerminalSession: (sessionId) =>
    ipcRenderer.invoke(CLOSE_TERMINAL_SESSION_CHANNEL, sessionId),
  showBrowserView: (input) =>
    ipcRenderer.invoke(SHOW_BROWSER_VIEW_CHANNEL, input),
  hideBrowserView: (browserViewId) =>
    ipcRenderer.invoke(HIDE_BROWSER_VIEW_CHANNEL, browserViewId),
  updateBrowserViewBounds: (input) =>
    ipcRenderer.invoke(UPDATE_BROWSER_VIEW_BOUNDS_CHANNEL, input),
  navigateBrowserView: (input) =>
    ipcRenderer.invoke(NAVIGATE_BROWSER_VIEW_CHANNEL, input),
  goBackBrowserView: (browserViewId) =>
    ipcRenderer.invoke(GO_BACK_BROWSER_VIEW_CHANNEL, browserViewId),
  goForwardBrowserView: (browserViewId) =>
    ipcRenderer.invoke(GO_FORWARD_BROWSER_VIEW_CHANNEL, browserViewId),
  reloadBrowserView: (browserViewId) =>
    ipcRenderer.invoke(RELOAD_BROWSER_VIEW_CHANNEL, browserViewId),
  openBrowserViewDevTools: (browserViewId) =>
    ipcRenderer.invoke(OPEN_BROWSER_VIEW_DEVTOOLS_CHANNEL, browserViewId),
  disposeBrowserView: (browserViewId) =>
    ipcRenderer.invoke(DISPOSE_BROWSER_VIEW_CHANNEL, browserViewId),
  disposeBrowserTarget: (codeTargetId) =>
    ipcRenderer.invoke(DISPOSE_BROWSER_TARGET_CHANNEL, codeTargetId),
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
  onBrowserViewEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, event: unknown) => {
      const parsedEvent = BrowserViewEventSchema.safeParse(event);

      if (!parsedEvent.success) {
        return;
      }

      listener(parsedEvent.data);
    };

    ipcRenderer.on(BROWSER_VIEW_EVENT_CHANNEL, handler);

    return () => {
      ipcRenderer.removeListener(BROWSER_VIEW_EVENT_CHANNEL, handler);
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
