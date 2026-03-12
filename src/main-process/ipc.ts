import { dialog, ipcMain, type BrowserWindow, type OpenDialogOptions } from 'electron';

import {
  GET_APP_BOOTSTRAP_CHANNEL,
  GET_PROJECT_ISSUES_CHANNEL,
  GET_PROJECT_PULL_REQUESTS_CHANNEL,
  PICK_REPO_DIRECTORY_CHANNEL,
  SAVE_REPO_CHANNEL,
  type AppBootstrap,
} from '../ipc/contracts';
import { getGhUser, getProjectFeed } from './github';
import { getSavedRepos } from './repo-store';
import { addRepo } from './repo-service';

const getAppBootstrap = async (): Promise<AppBootstrap> => {
  const [ghUser, repos] = await Promise.all([getGhUser(), getSavedRepos()]);

  return { ghUser, repos };
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
  ipcMain.handle(SAVE_REPO_CHANNEL, (_event, repoPath: string) => addRepo(repoPath));
  ipcMain.handle(PICK_REPO_DIRECTORY_CHANNEL, () =>
    pickRepoDirectory(getMainWindow()),
  );
  ipcMain.handle(GET_PROJECT_ISSUES_CHANNEL, (_event, projectPath: string, skipCache?: boolean) =>
    getProjectFeed(projectPath, 'issues', skipCache),
  );
  ipcMain.handle(
    GET_PROJECT_PULL_REQUESTS_CHANNEL,
    (_event, projectPath: string, skipCache?: boolean) =>
      getProjectFeed(projectPath, 'pull-requests', skipCache),
  );
};
