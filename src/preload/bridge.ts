import { ipcRenderer } from 'electron';

import {
  APP_SHORTCUT_COMMAND_CHANNEL,
  AppShortcutCommandSchema,
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
  getIssueDetail: (owner, name, issueNumber) =>
    ipcRenderer.invoke(GET_ISSUE_DETAIL_CHANNEL, owner, name, issueNumber),
  getPullRequestDetail: (owner, name, prNumber) =>
    ipcRenderer.invoke(GET_PULL_REQUEST_DETAIL_CHANNEL, owner, name, prNumber),
  validateLocalGitRepository: (directoryPath) =>
    ipcRenderer.invoke(VALIDATE_LOCAL_GIT_REPO_CHANNEL, directoryPath),
  getGithubRepoDetails: (projectPath) =>
    ipcRenderer.invoke(GET_GITHUB_REPO_DETAILS_CHANNEL, projectPath),
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
  getGitStatus: (repoPath) =>
    ipcRenderer.invoke(GET_GIT_STATUS_CHANNEL, repoPath),
  checkoutGitBranch: (repoPath, branchName) =>
    ipcRenderer.invoke(CHECKOUT_GIT_BRANCH_CHANNEL, repoPath, branchName),
  getGitFileDiff: (repoPath, filePath) =>
    ipcRenderer.invoke(GET_GIT_FILE_DIFF_CHANNEL, repoPath, filePath),
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
