import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent, type OpenDialogOptions } from 'electron';

import {
  GET_APP_BOOTSTRAP_CHANNEL,
  GET_ISSUE_DETAIL_CHANNEL,
  GET_PULL_REQUEST_DETAIL_CHANNEL,
  GET_PROJECT_ISSUES_CHANNEL,
  GET_PROJECT_PULL_REQUESTS_CHANNEL,
  GET_GITHUB_REPO_DETAILS_CHANNEL,
  PICK_REPO_DIRECTORY_CHANNEL,
  VALIDATE_LOCAL_GIT_REPO_CHANNEL,
  CLONE_GITHUB_REPO_CHANNEL,
  CLONE_GITHUB_REPO_PROGRESS_CHANNEL,
  GET_GIT_BRANCHES_CHANNEL,
  GET_GIT_STATUS_CHANNEL,
  CHECKOUT_GIT_BRANCH_CHANNEL,
  GET_GIT_FILE_DIFF_CHANNEL,
  GENERATE_PR_REVIEW_CHANNEL,
  type AppBootstrap,
} from '../ipc/contracts';
import { codexExecutable } from './codex-cli';
import { generatePrReview } from './codex-use-cases/pr-review';
import { ghExecutable } from './gh-cli';
import { getRepositoryIssueDetail } from './gh-queries/issue-detail';
import { getRepositoryPullRequestDetail } from './gh-queries/pull-request-detail';
import { getRepositoryIssues } from './gh-queries/issues';
import { getRepositoryPullRequests } from './gh-queries/pull-requests';
import { getGhUser } from './gh-queries/user';
import {
  checkoutGitBranch,
  cloneGithubRepo,
  getGitBranches,
  getGitFileDiff,
  getGitStatus,
  getGithubRepoDetails,
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
    GET_ISSUE_DETAIL_CHANNEL,
    (_event, owner: string, name: string, issueNumber: number) =>
      getRepositoryIssueDetail(owner, name, issueNumber),
  );
  ipcMain.handle(
    GET_PULL_REQUEST_DETAIL_CHANNEL,
    (_event, owner: string, name: string, prNumber: number) =>
      getRepositoryPullRequestDetail(owner, name, prNumber),
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
    GET_GIT_STATUS_CHANNEL,
    (_event, repoPath: string) => getGitStatus(repoPath),
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
    GENERATE_PR_REVIEW_CHANNEL,
    (_event, owner: string, name: string, prNumber: number, repoPath: string) => {
      if (ghExecutable === null) {
        throw new Error('GitHub CLI is not available on this machine.');
      }
      if (codexExecutable === null) {
        throw new Error('Codex CLI is not installed. Install it from https://codex.openai.com');
      }

      return generatePrReview(codexExecutable, ghExecutable, owner, name, prNumber, repoPath);
    },
  );
};
