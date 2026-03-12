import { ipcRenderer } from 'electron';

import {
  GET_APP_BOOTSTRAP_CHANNEL,
  GET_PROJECT_ISSUES_CHANNEL,
  GET_PROJECT_PULL_REQUESTS_CHANNEL,
  PICK_REPO_DIRECTORY_CHANNEL,
  SAVE_REPO_CHANNEL,
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
  saveRepo: (path) => ipcRenderer.invoke(SAVE_REPO_CHANNEL, path),
  pickRepoDirectory: () => ipcRenderer.invoke(PICK_REPO_DIRECTORY_CHANNEL),
  getProjectIssues: (projectPath, skipCache) =>
    ipcRenderer.invoke(GET_PROJECT_ISSUES_CHANNEL, projectPath, skipCache),
  getProjectPullRequests: (projectPath, skipCache) =>
    ipcRenderer.invoke(GET_PROJECT_PULL_REQUESTS_CHANNEL, projectPath, skipCache),
};
