import { dialog, ipcMain, type BrowserWindow, type OpenDialogOptions } from 'electron';

import {
  GET_APP_BOOTSTRAP_CHANNEL,
  GET_ISSUE_DETAIL_CHANNEL,
  GET_PROJECT_ISSUES_CHANNEL,
  GET_PROJECT_PULL_REQUESTS_CHANNEL,
  GET_WORKSPACE_PREFERENCES_CHANNEL,
  PICK_REPO_DIRECTORY_CHANNEL,
  REMOVE_REPO_CHANNEL,
  REORDER_REPOS_CHANNEL,
  SAVE_REPO_CHANNEL,
  SET_WORKSPACE_PREFERENCES_CHANNEL,
  type AppBootstrap,
  type WorkspacePreferences,
} from '../ipc/contracts';
import { getGhUser, getIssueDetail, getProjectFeed } from './github';
import { getSavedRepos } from './repo-store';
import { addRepo, removeRepo, reorderRepos } from './repo-service';
import {
  getWorkspacePreferences,
  updateWorkspacePreferences,
} from './workspace-preferences-store';

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
  ipcMain.handle(GET_WORKSPACE_PREFERENCES_CHANNEL, () => getWorkspacePreferences());
  ipcMain.handle(
    SET_WORKSPACE_PREFERENCES_CHANNEL,
    (_event, preferences: Partial<WorkspacePreferences>) =>
      updateWorkspacePreferences(preferences),
  );
  ipcMain.handle(SAVE_REPO_CHANNEL, (_event, repoPath: string) => addRepo(repoPath));
  ipcMain.handle(REMOVE_REPO_CHANNEL, (_event, repoId: string) => removeRepo(repoId));
  ipcMain.handle(REORDER_REPOS_CHANNEL, (_event, orderedRepoIds: string[]) =>
    reorderRepos(orderedRepoIds),
  );
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
  ipcMain.handle(
    GET_ISSUE_DETAIL_CHANNEL,
    (_event, projectPath: string, issueNumber: number) =>
      getIssueDetail(projectPath, issueNumber),
  );
};
