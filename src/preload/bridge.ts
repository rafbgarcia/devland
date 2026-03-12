import { ipcRenderer } from 'electron';

import {
  GET_APP_BOOTSTRAP_CHANNEL,
  GET_PROJECT_ISSUES_CHANNEL,
  GET_PROJECT_PULL_REQUESTS_CHANNEL,
  GET_WORKSPACE_PREFERENCES_CHANNEL,
  PICK_REPO_DIRECTORY_CHANNEL,
  REMOVE_REPO_CHANNEL,
  REORDER_REPOS_CHANNEL,
  SAVE_REPO_CHANNEL,
  SET_WORKSPACE_PREFERENCES_CHANNEL,
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
  getWorkspacePreferences: () => ipcRenderer.invoke(GET_WORKSPACE_PREFERENCES_CHANNEL),
  setWorkspacePreferences: (preferences) =>
    ipcRenderer.invoke(SET_WORKSPACE_PREFERENCES_CHANNEL, preferences),
  saveRepo: (path) => ipcRenderer.invoke(SAVE_REPO_CHANNEL, path),
  removeRepo: (repoId) => ipcRenderer.invoke(REMOVE_REPO_CHANNEL, repoId),
  reorderRepos: (orderedRepoIds) =>
    ipcRenderer.invoke(REORDER_REPOS_CHANNEL, orderedRepoIds),
  pickRepoDirectory: () => ipcRenderer.invoke(PICK_REPO_DIRECTORY_CHANNEL),
  getProjectIssues: (projectPath, skipCache) =>
    ipcRenderer.invoke(GET_PROJECT_ISSUES_CHANNEL, projectPath, skipCache),
  getProjectPullRequests: (projectPath, skipCache) =>
    ipcRenderer.invoke(GET_PROJECT_PULL_REQUESTS_CHANNEL, projectPath, skipCache),
};
