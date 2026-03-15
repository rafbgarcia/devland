import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent, type OpenDialogOptions } from 'electron';

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
  GET_GIT_BRANCH_COMPARE_META_CHANNEL,
  GET_GIT_BRANCH_COMPARE_DIFF_CHANNEL,
  GET_GIT_STATUS_CHANNEL,
  GET_GIT_WORKING_TREE_DIFF_CHANNEL,
  CHECKOUT_GIT_BRANCH_CHANNEL,
  GET_GIT_FILE_DIFF_CHANNEL,
  CREATE_GIT_WORKTREE_CHANNEL,
  PROMOTE_GIT_WORKTREE_BRANCH_CHANNEL,
  GENERATE_PR_REVIEW_CHANNEL,
  SYNC_REPO_REVIEW_REFS_CHANNEL,
  GET_PR_DIFF_META_CHANNEL,
  GET_COMMIT_DIFF_CHANNEL,
  GET_PR_DIFF_CHANNEL,
  INTERRUPT_CODEX_SESSION_CHANNEL,
  RESPOND_TO_CODEX_APPROVAL_CHANNEL,
  RESPOND_TO_CODEX_USER_INPUT_CHANNEL,
  SEND_CODEX_SESSION_PROMPT_CHANNEL,
  STOP_CODEX_SESSION_CHANNEL,
  type AppBootstrap,
  type CodexApprovalDecision,
} from '../ipc/contracts';
import { codexAppServerManager } from './codex-app-server';
import { codexExecutable } from './codex-cli';
import { generatePrReview } from './codex-use-cases/pr-review';
import { ghExecutable } from './gh-cli';
import { getRepositoryIssues } from './gh-queries/issues';
import { getRepositoryPullRequests } from './gh-queries/pull-requests';
import { getGhUser } from './gh-queries/user';
import {
  checkoutGitBranch,
  createGitWorktree,
  cloneGithubRepo,
  findLocalGithubRepoPath,
  getGitBranchCompareDiff,
  getGitBranchCompareMeta,
  getCommitDiff,
  getGitBranches,
  getGitDefaultBranch,
  getGitFileDiff,
  getGitWorkingTreeDiff,
  getGitStatus,
  getGithubRepoDetails,
  getPrDiff,
  getPrDiffMeta,
  promoteGitWorktreeBranch,
  syncRepoReviewRefs,
  validateLocalGitRepository,
} from './git';

const getAppBootstrap = async (): Promise<AppBootstrap> => {
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
    SEND_CODEX_SESSION_PROMPT_CHANNEL,
    (_event, input: { sessionId: string; cwd: string; prompt: string }) =>
      codexAppServerManager.sendPrompt(input.sessionId, input.cwd, input.prompt),
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
};
