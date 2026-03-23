import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent, type OpenDialogOptions } from 'electron';

import type {
  CodexChatImageAttachment,
  CodexComposerSettings,
  CodexImageAttachmentInput,
} from '@/lib/codex-chat';
import {
  BROWSER_VIEW_EVENT_CHANNEL,
  CODEX_SESSION_EVENT_CHANNEL,
  CLOSE_CURRENT_WINDOW_CHANNEL,
  GET_CODEX_PROMPT_REQUEST_CHECKPOINT_CHANNEL,
  GET_APP_BOOTSTRAP_CHANNEL,
  GET_GITHUB_REPO_DETAILS_CHANNEL,
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
  GET_GIT_BRANCH_PROMPT_REQUESTS_CHANNEL,
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
  GET_GIT_BLOB_TEXT_CHANNEL,
  GET_WORKING_TREE_FILE_TEXT_CHANNEL,
  GET_COMMIT_PARENT_CHANNEL,
  GET_REPO_EXTENSIONS_CHANNEL,
  INSTALL_REPO_EXTENSION_CHANNEL,
  RUN_EXTENSION_COMMAND_CHANNEL,
  LIST_AVAILABLE_EXTERNAL_EDITORS_CHANNEL,
  PICK_EXTERNAL_EDITOR_PATH_CHANNEL,
  VALIDATE_EXTERNAL_EDITOR_PATH_CHANNEL,
  OPEN_FILE_IN_EXTERNAL_EDITOR_CHANNEL,
  PERSIST_CODEX_ATTACHMENTS_CHANNEL,
  START_GIT_STATE_WATCH_CHANNEL,
  STOP_GIT_STATE_WATCH_CHANNEL,
  LIST_CODEX_THREADS_CHANNEL,
  RESUME_CODEX_THREAD_CHANNEL,
  SEARCH_CODEX_PATHS_CHANNEL,
  INTERRUPT_CODEX_SESSION_CHANNEL,
  RESPOND_TO_CODEX_APPROVAL_CHANNEL,
  RESPOND_TO_CODEX_USER_INPUT_CHANNEL,
  SEND_CODEX_SESSION_PROMPT_CHANNEL,
  STOP_CODEX_SESSION_CHANNEL,
  OPEN_TERMINAL_SESSION_CHANNEL,
  EXEC_TERMINAL_SESSION_COMMAND_CHANNEL,
  WRITE_TERMINAL_SESSION_CHANNEL,
  RESIZE_TERMINAL_SESSION_CHANNEL,
  CLOSE_TERMINAL_SESSION_CHANNEL,
  TERMINAL_SESSION_EVENT_CHANNEL,
  SHOW_BROWSER_VIEW_CHANNEL,
  HIDE_BROWSER_VIEW_CHANNEL,
  UPDATE_BROWSER_VIEW_BOUNDS_CHANNEL,
  NAVIGATE_BROWSER_VIEW_CHANNEL,
  GO_BACK_BROWSER_VIEW_CHANNEL,
  GO_FORWARD_BROWSER_VIEW_CHANNEL,
  RELOAD_BROWSER_VIEW_CHANNEL,
  OPEN_BROWSER_VIEW_DEVTOOLS_CHANNEL,
  DISPOSE_BROWSER_VIEW_CHANNEL,
  DISPOSE_BROWSER_TARGET_CHANNEL,
  WRITE_GIT_PROMPT_REQUEST_NOTE_CHANNEL,
  type AppBootstrap,
  type CodexApprovalDecision,
  type GitPromptRequestSnapshot,
} from '../ipc/contracts';
import { browserViewManager } from './browser/browser-view-manager';
import { codexAppServerManager } from './codex-app-server';
import { persistCodexAttachments } from './codex-attachments';
import {
  getCodexPromptRequestCheckpoint,
  recordCodexPromptRequestCheckpoint,
} from './codex-prompt-request-checkpoint-store';
import { searchCodexPaths } from './codex-path-search';
import { codexExecutable } from './codex-cli';
import { suggestGitWorktreeBranchName } from './codex-use-cases/worktree-branch-name';
import { ghExecutable } from './gh-cli';
import { getRepoExtensions, installRepoExtension } from './extensions/repo-extensions';
import { runExtensionCommand } from './extensions/runtime';
import {
  checkoutGitBranch,
  checkGitWorktreeRemoval,
  createGitBranch,
  createGitWorktree,
  cloneGithubRepo,
  commitWorkingTreeSelection,
  findLocalGithubRepoPath,
  getGitBranchCompareDiff,
  getGitBranchCompareMeta,
  getGitBranchPromptRequests,
  getGitBlobText,
  getCommitDiff,
  getCommitParent,
  getGitBranches,
  getGitDefaultBranch,
  getGitBranchHistory,
  getGitFileDiff,
  getGitWorkingTreeDiff,
  getGitStatus,
  getGithubRepoDetails,
  removeGitWorktree,
  writeGitPromptRequestNote,
  getWorkingTreeFileText,
  validateLocalGitRepository,
} from './git';
import { gitStateWatcher } from './git-state-watcher';
import { terminalSessionManager } from './terminal-session-manager';
import { readRepoConfig } from './repo-config';
import {
  listAvailableExternalEditors,
  openFileInExternalEditor,
  pickExternalEditorPath,
  validateExternalEditorPath,
} from './external-editor';

const getAppBootstrap = (): AppBootstrap => {
  return { ghCliAvailable: ghExecutable !== null };
};

const pickRepoDirectory = async (
  mainWindow: BrowserWindow | null,
): Promise<string | null> => {
  const dialogOptions: OpenDialogOptions = {
    title: 'Select a local repository',
    buttonLabel: 'Use this folder',
    properties: ['openDirectory', 'dontAddToRecent'],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
};

const pickCustomExternalEditorPath = async (
  mainWindow: BrowserWindow | null,
): Promise<string | null> => {
  const dialogOptions: OpenDialogOptions = {
    title: 'Select an external editor',
    buttonLabel: 'Use this editor',
    properties:
      process.platform === 'darwin'
        ? ['openFile', 'openDirectory', 'dontAddToRecent']
        : ['openFile', 'dontAddToRecent'],
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0] ?? null;
};

export const registerAppIpcHandlers = (
  getMainWindow: () => BrowserWindow | null,
): void => {
  browserViewManager.setMainWindowProvider(getMainWindow);
  browserViewManager.on('event', (event) => {
    getMainWindow()?.webContents.send(BROWSER_VIEW_EVENT_CHANNEL, event);
  });
  codexAppServerManager.on('event', (event) => {
    getMainWindow()?.webContents.send(CODEX_SESSION_EVENT_CHANNEL, event);
  });
  gitStateWatcher.on('changed', (event) => {
    getMainWindow()?.webContents.send(GIT_STATE_CHANGED_CHANNEL, event);
  });
  terminalSessionManager.on('event', (event) => {
    getMainWindow()?.webContents.send(TERMINAL_SESSION_EVENT_CHANNEL, event);
  });

  ipcMain.handle(GET_APP_BOOTSTRAP_CHANNEL, () => getAppBootstrap());
  ipcMain.handle(PICK_REPO_DIRECTORY_CHANNEL, () =>
    pickRepoDirectory(getMainWindow()),
  );
  ipcMain.handle(CLOSE_CURRENT_WINDOW_CHANNEL, (event: IpcMainInvokeEvent) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle(
    VALIDATE_LOCAL_GIT_REPO_CHANNEL,
    (_event, directoryPath: string) =>
      validateLocalGitRepository(directoryPath),
  );
  ipcMain.handle(
    GET_GITHUB_REPO_DETAILS_CHANNEL,
    (_event, projectPath: string) => getGithubRepoDetails(projectPath),
  );
  ipcMain.handle(
    GET_REPO_CONFIG_CHANNEL,
    (_event, repoPath: string) => readRepoConfig(repoPath),
  );
  ipcMain.handle(
    FIND_LOCAL_GITHUB_REPO_CHANNEL,
    (_event, slug: string) => findLocalGithubRepoPath(slug),
  );
  ipcMain.handle(
    CLONE_GITHUB_REPO_CHANNEL,
    (event: IpcMainInvokeEvent, slug: string) => {
      if (ghExecutable === null) {
        throw new Error('GitHub CLI is not available on this machine.');
      }

      return cloneGithubRepo(ghExecutable, slug, (line) => {
        event.sender.send(CLONE_GITHUB_REPO_PROGRESS_CHANNEL, line);
      });
    },
  );
  ipcMain.handle(
    GET_GIT_BRANCHES_CHANNEL,
    (_event, repoPath: string) => getGitBranches(repoPath),
  );
  ipcMain.handle(
    GET_GIT_DEFAULT_BRANCH_CHANNEL,
    (_event, repoPath: string) => getGitDefaultBranch(repoPath),
  );
  ipcMain.handle(
    GET_GIT_BRANCH_HISTORY_CHANNEL,
    (_event, repoPath: string, branchName: string) =>
      getGitBranchHistory(repoPath, branchName),
  );
  ipcMain.handle(
    START_GIT_STATE_WATCH_CHANNEL,
    (_event, repoPath: string) => gitStateWatcher.subscribe(repoPath),
  );
  ipcMain.handle(
    STOP_GIT_STATE_WATCH_CHANNEL,
    (_event, subscriptionId: string) => {
      gitStateWatcher.unsubscribe(subscriptionId);
    },
  );
  ipcMain.handle(
    GET_GIT_BRANCH_COMPARE_META_CHANNEL,
    (_event, repoPath: string, baseBranch: string, headBranch: string) =>
      getGitBranchCompareMeta(repoPath, baseBranch, headBranch),
  );
  ipcMain.handle(
    GET_GIT_BRANCH_COMPARE_DIFF_CHANNEL,
    (_event, repoPath: string, baseBranch: string, headBranch: string) =>
      getGitBranchCompareDiff(repoPath, baseBranch, headBranch),
  );
  ipcMain.handle(
    GET_GIT_BRANCH_PROMPT_REQUESTS_CHANNEL,
    (_event, input: { repoPath: string; baseBranch: string; headBranch: string }) =>
      getGitBranchPromptRequests(input),
  );
  ipcMain.handle(
    GET_GIT_STATUS_CHANNEL,
    (_event, repoPath: string) => getGitStatus(repoPath),
  );
  ipcMain.handle(
    GET_GIT_WORKING_TREE_DIFF_CHANNEL,
    (_event, repoPath: string) => getGitWorkingTreeDiff(repoPath),
  );
  ipcMain.handle(
    CHECKOUT_GIT_BRANCH_CHANNEL,
    (_event, repoPath: string, branchName: string) =>
      checkoutGitBranch(repoPath, branchName),
  );
  ipcMain.handle(
    CREATE_GIT_BRANCH_CHANNEL,
    (_event, repoPath: string, branchName: string) =>
      createGitBranch(repoPath, branchName),
  );
  ipcMain.handle(
    GET_GIT_FILE_DIFF_CHANNEL,
    (_event, repoPath: string, filePath: string) =>
      getGitFileDiff(repoPath, filePath),
  );
  ipcMain.handle(
    CREATE_GIT_WORKTREE_CHANNEL,
    async (_event, repoPath: string) => {
      const result = await createGitWorktree(repoPath);
      const config = await readRepoConfig(repoPath);

      return {
        ...result,
        worktreeSetupCommand: config.worktreeSetupCommand,
      };
    },
  );
  ipcMain.handle(
    SUGGEST_GIT_WORKTREE_BRANCH_NAME_CHANNEL,
    (_event, repoPath: string, prompt: string) => {
      if (codexExecutable === null) {
        throw new Error('Codex CLI is not installed.');
      }

      return suggestGitWorktreeBranchName(codexExecutable, repoPath, prompt);
    },
  );
  ipcMain.handle(
    CHECK_GIT_WORKTREE_REMOVAL_CHANNEL,
    (_event, _repoPath: string, worktreePath: string) =>
      checkGitWorktreeRemoval(worktreePath),
  );
  ipcMain.handle(
    REMOVE_GIT_WORKTREE_CHANNEL,
    (_event, repoPath: string, worktreePath: string, force = false) =>
      removeGitWorktree(repoPath, worktreePath, force),
  );
  ipcMain.handle(
    COMMIT_WORKING_TREE_SELECTION_CHANNEL,
    (_event, input) => commitWorkingTreeSelection(input),
  );
  ipcMain.handle(
    GET_CODEX_PROMPT_REQUEST_CHECKPOINT_CHANNEL,
    (_event, input: { repoPath: string; threadId: string }) =>
      getCodexPromptRequestCheckpoint(input),
  );
  ipcMain.handle(
    WRITE_GIT_PROMPT_REQUEST_NOTE_CHANNEL,
    async (_event, input: {
      repoPath: string;
      commitSha: string;
      threadId: string;
      transcriptEntryCount: number;
      snapshot: GitPromptRequestSnapshot;
    }) => {
      await writeGitPromptRequestNote({
        repoPath: input.repoPath,
        commitSha: input.commitSha,
        snapshot: input.snapshot,
      });
      await recordCodexPromptRequestCheckpoint({
        repoPath: input.repoPath,
        threadId: input.threadId,
        transcriptEntryCount: input.transcriptEntryCount,
      });
    },
  );
  ipcMain.handle(
    GET_COMMIT_DIFF_CHANNEL,
    (_event, repoPath: string, commitSha: string) =>
      getCommitDiff(repoPath, commitSha),
  );
  ipcMain.handle(
    GET_GIT_BLOB_TEXT_CHANNEL,
    (_event, input: { repoPath: string; revision: string; filePath: string; maxBytes?: number }) =>
      getGitBlobText(input),
  );
  ipcMain.handle(
    GET_WORKING_TREE_FILE_TEXT_CHANNEL,
    (_event, input: { repoPath: string; filePath: string; maxBytes?: number }) =>
      getWorkingTreeFileText(input),
  );
  ipcMain.handle(
    GET_COMMIT_PARENT_CHANNEL,
    (_event, repoPath: string, commitSha: string) =>
      getCommitParent(repoPath, commitSha),
  );
  ipcMain.handle(
    GET_REPO_EXTENSIONS_CHANNEL,
    (_event, repoPath: string) => getRepoExtensions(repoPath),
  );
  ipcMain.handle(
    INSTALL_REPO_EXTENSION_CHANNEL,
    (_event, input) => installRepoExtension(input),
  );
  ipcMain.handle(
    RUN_EXTENSION_COMMAND_CHANNEL,
    (_event, input) => runExtensionCommand(input),
  );
  ipcMain.handle(
    LIST_AVAILABLE_EXTERNAL_EDITORS_CHANNEL,
    () => listAvailableExternalEditors(),
  );
  ipcMain.handle(
    PICK_EXTERNAL_EDITOR_PATH_CHANNEL,
    () => pickExternalEditorPath(() => pickCustomExternalEditorPath(getMainWindow())),
  );
  ipcMain.handle(
    VALIDATE_EXTERNAL_EDITOR_PATH_CHANNEL,
    (_event, editorPath: string) => validateExternalEditorPath(editorPath),
  );
  ipcMain.handle(
    OPEN_FILE_IN_EXTERNAL_EDITOR_CHANNEL,
    (_event, input) => openFileInExternalEditor(input),
  );
  ipcMain.handle(
    PERSIST_CODEX_ATTACHMENTS_CHANNEL,
    (_event, input: { sessionId: string; attachments: CodexImageAttachmentInput[] }) =>
      persistCodexAttachments(input.sessionId, input.attachments),
  );
  ipcMain.handle(
    SEND_CODEX_SESSION_PROMPT_CHANNEL,
    (
      _event,
      input: {
        sessionId: string;
        cwd: string;
        prompt: string;
        settings: CodexComposerSettings;
        attachments: CodexImageAttachmentInput[];
        persistedAttachments?: CodexChatImageAttachment[];
        resumeThreadId?: string | null;
        transcriptBootstrap?: string | null;
      },
    ) =>
      codexAppServerManager.sendPrompt(
        input.sessionId,
        input.cwd,
        input.prompt,
        input.settings,
        input.attachments,
        input.persistedAttachments ?? [],
        input.resumeThreadId ?? null,
        input.transcriptBootstrap ?? null,
      ),
  );
  ipcMain.handle(
    LIST_CODEX_THREADS_CHANNEL,
    (_event, input: { cwd: string; limit?: number }) =>
      codexAppServerManager.listThreads(input.cwd, input.limit ?? 20),
  );
  ipcMain.handle(
    RESUME_CODEX_THREAD_CHANNEL,
    (_event, input: {
      sessionId: string;
      cwd: string;
      threadId: string;
      settings: CodexComposerSettings;
    }) =>
      codexAppServerManager.resumeThread(
        input.sessionId,
        input.cwd,
        input.settings,
        input.threadId,
      ),
  );
  ipcMain.handle(
    SEARCH_CODEX_PATHS_CHANNEL,
    (_event, input) => searchCodexPaths(input),
  );
  ipcMain.handle(
    INTERRUPT_CODEX_SESSION_CHANNEL,
    (_event, sessionId: string) => codexAppServerManager.interruptSession(sessionId),
  );
  ipcMain.handle(
    STOP_CODEX_SESSION_CHANNEL,
    (_event, sessionId: string) => codexAppServerManager.stopSession(sessionId),
  );
  ipcMain.handle(
    RESPOND_TO_CODEX_APPROVAL_CHANNEL,
    (
      _event,
      input: { sessionId: string; requestId: string; decision: CodexApprovalDecision },
    ) =>
      codexAppServerManager.respondToApproval(
        input.sessionId,
        input.requestId,
        input.decision,
      ),
  );
  ipcMain.handle(
    RESPOND_TO_CODEX_USER_INPUT_CHANNEL,
    (
      _event,
      input: { sessionId: string; requestId: string; answers: Record<string, string> },
    ) =>
      codexAppServerManager.respondToUserInput(
        input.sessionId,
        input.requestId,
        input.answers,
      ),
  );
  ipcMain.handle(
    OPEN_TERMINAL_SESSION_CHANNEL,
    (_event, input) => terminalSessionManager.open(input),
  );
  ipcMain.handle(
    EXEC_TERMINAL_SESSION_COMMAND_CHANNEL,
    (_event, input) => terminalSessionManager.exec(input),
  );
  ipcMain.handle(
    WRITE_TERMINAL_SESSION_CHANNEL,
    (_event, input) => terminalSessionManager.write(input),
  );
  ipcMain.handle(
    RESIZE_TERMINAL_SESSION_CHANNEL,
    (_event, input) => terminalSessionManager.resize(input),
  );
  ipcMain.handle(
    CLOSE_TERMINAL_SESSION_CHANNEL,
    (_event, sessionId: string) => terminalSessionManager.close(sessionId),
  );
  ipcMain.handle(
    SHOW_BROWSER_VIEW_CHANNEL,
    (_event, input) => browserViewManager.show(input),
  );
  ipcMain.handle(
    HIDE_BROWSER_VIEW_CHANNEL,
    (_event, browserViewId: string) => browserViewManager.hide(browserViewId),
  );
  ipcMain.handle(
    UPDATE_BROWSER_VIEW_BOUNDS_CHANNEL,
    (_event, input) => browserViewManager.updateBounds(input),
  );
  ipcMain.handle(
    NAVIGATE_BROWSER_VIEW_CHANNEL,
    (_event, input) => browserViewManager.navigate(input),
  );
  ipcMain.handle(
    GO_BACK_BROWSER_VIEW_CHANNEL,
    (_event, browserViewId: string) => browserViewManager.goBack(browserViewId),
  );
  ipcMain.handle(
    GO_FORWARD_BROWSER_VIEW_CHANNEL,
    (_event, browserViewId: string) => browserViewManager.goForward(browserViewId),
  );
  ipcMain.handle(
    RELOAD_BROWSER_VIEW_CHANNEL,
    (_event, browserViewId: string) => browserViewManager.reload(browserViewId),
  );
  ipcMain.handle(
    OPEN_BROWSER_VIEW_DEVTOOLS_CHANNEL,
    (_event, browserViewId: string) => browserViewManager.openDevTools(browserViewId),
  );
  ipcMain.handle(
    DISPOSE_BROWSER_VIEW_CHANNEL,
    (_event, browserViewId: string) => browserViewManager.disposeView(browserViewId),
  );
  ipcMain.handle(
    DISPOSE_BROWSER_TARGET_CHANNEL,
    (_event, codeTargetId: string) => browserViewManager.disposeTarget(codeTargetId),
  );
};
