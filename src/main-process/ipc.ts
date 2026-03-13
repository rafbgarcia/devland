import { dialog, ipcMain, type BrowserWindow, type OpenDialogOptions } from 'electron';

import {
  GET_APP_BOOTSTRAP_CHANNEL,
  GET_ISSUE_DETAIL_CHANNEL,
  GET_PROJECT_ISSUES_CHANNEL,
  GET_PROJECT_PULL_REQUESTS_CHANNEL,
  GET_REPO_DETAILS_CHANNEL,
  PICK_REPO_DIRECTORY_CHANNEL,
  type AppBootstrap,
} from '../ipc/contracts';
import { getRepositoryIssueDetail } from './gh-queries/issue-detail';
import { getRepositoryIssues } from './gh-queries/issues';
import { getRepositoryPullRequests } from './gh-queries/pull-requests';
import { getGhUser } from './gh-queries/user';
import { getRepoDetails } from './git';

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
  ipcMain.handle(GET_REPO_DETAILS_CHANNEL, (_event, projectPath: string) =>
    getRepoDetails(projectPath),
  );
};
