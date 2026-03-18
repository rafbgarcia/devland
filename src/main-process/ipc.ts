import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent, type OpenDialogOptions } from 'electron';

import type {
  CodexComposerSettings,
  CodexImageAttachmentInput,
} from '@/lib/codex-chat';
import {
  CODEX_SESSION_EVENT_CHANNEL,
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
  WRITE_TERMINAL_SESSION_CHANNEL,
  RESIZE_TERMINAL_SESSION_CHANNEL,
  CLOSE_TERMINAL_SESSION_CHANNEL,
  TERMINAL_SESSION_EVENT_CHANNEL,
  type AppBootstrap,
  type CodexApprovalDecision,
} from '../ipc/contracts';
import { codexAppServerManager } from './codex-app-server';
import { searchCodexPaths } from './codex-path-search';
import { codexExecutable } from './codex-cli';
import { generatePrReview } from './codex-use-cases/pr-review';
import { ghExecutable } from './gh-cli';
import { createGitHubPrReviewThread } from './gh-review-comments';
import { getRepositoryIssues } from './gh-queries/issues';
import { getRepositoryPullRequests } from './gh-queries/pull-requests';
import { getGhUser } from './gh-queries/user';
import {
  checkoutGitBranch,
  createGitWorktree,
  cloneGithubRepo,
  commitWorkingTreeSelection,
  findLocalGithubRepoPath,
  getGitBranchCompareDiff,
  getGitBranchCompareMeta,
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
  getPrDiff,
  getPrDiffMeta,
  promoteGitWorktreeBranch,
  syncRepoReviewRefs,
  getWorkingTreeFileText,
  validateLocalGitRepository,
} from './git';
import { gitStateWatcher } from './git-state-watcher';
import { terminalSessionManager } from './terminal-session-manager';

const getAppBootstrap = async (): Promise<AppBootstrap> => {
  if (process.env.DEVLAND_TEST_MODE === '1') {
    return {
      ghUser: {
        login: process.env.DEVLAND_TEST_GH_LOGIN?.trim() || 'devland-test',
      },
    };
  }

  const ghUser = await getGhUser();

  return { ghUser };
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

export const registerAppIpcHandlers = (
  getMainWindow: () => BrowserWindow | null,
): void => {
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
  ipcMain.handle(
    GET_PROJECT_ISSUES_CHANNEL,
    (_event, owner: string, name: string, skipCache?: boolean) =>
      getRepositoryIssues(owner, name, skipCache),
  );
  ipcMain.handle(
    GET_PROJECT_PULL_REQUESTS_CHANNEL,
    (_event, owner: string, name: string, skipCache?: boolean) =>
      getRepositoryPullRequests(owner, name, skipCache),
  );
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
    GET_GIT_FILE_DIFF_CHANNEL,
    (_event, repoPath: string, filePath: string) =>
      getGitFileDiff(repoPath, filePath),
  );
  ipcMain.handle(
    CREATE_GIT_WORKTREE_CHANNEL,
    (_event, repoPath: string, baseBranch: string) =>
      createGitWorktree(repoPath, baseBranch),
  );
  ipcMain.handle(
    PROMOTE_GIT_WORKTREE_BRANCH_CHANNEL,
    (_event, repoPath: string, currentBranch: string, prompt: string) =>
      promoteGitWorktreeBranch(repoPath, currentBranch, prompt),
  );
  ipcMain.handle(
    COMMIT_WORKING_TREE_SELECTION_CHANNEL,
    (_event, input) => commitWorkingTreeSelection(input),
  );
  ipcMain.handle(
    GENERATE_PR_REVIEW_CHANNEL,
    (_event, repoPath: string, prNumber: number, title: string) => {
      if (codexExecutable === null) {
        throw new Error('Codex CLI is not installed. Install it from https://codex.openai.com');
      }

      return generatePrReview(codexExecutable, repoPath, prNumber, title);
    },
  );
  ipcMain.handle(
    GET_PR_DIFF_META_CHANNEL,
    (_event, repoPath: string, prNumber: number) =>
      getPrDiffMeta(repoPath, prNumber),
  );
  ipcMain.handle(
    SYNC_REPO_REVIEW_REFS_CHANNEL,
    (_event, repoPath: string, owner: string, name: string) => {
      if (ghExecutable === null) {
        throw new Error('GitHub CLI is not available on this machine.');
      }

      return syncRepoReviewRefs(repoPath, ghExecutable, owner, name);
    },
  );
  ipcMain.handle(
    CREATE_GITHUB_PR_REVIEW_THREAD_CHANNEL,
    (_event, input) => createGitHubPrReviewThread(input),
  );
  ipcMain.handle(
    GET_COMMIT_DIFF_CHANNEL,
    (_event, repoPath: string, commitSha: string) =>
      getCommitDiff(repoPath, commitSha),
  );
  ipcMain.handle(
    GET_PR_DIFF_CHANNEL,
    (_event, repoPath: string, prNumber: number) =>
      getPrDiff(repoPath, prNumber),
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
    SEND_CODEX_SESSION_PROMPT_CHANNEL,
    (
      _event,
      input: {
        sessionId: string;
        cwd: string;
        prompt: string;
        settings: CodexComposerSettings;
        attachments: CodexImageAttachmentInput[];
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
};
