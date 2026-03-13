import { ipcRenderer } from 'electron';

import {
  GET_APP_BOOTSTRAP_CHANNEL,
  GET_ISSUE_DETAIL_CHANNEL,
  GET_PROJECT_ISSUES_CHANNEL,
  GET_PROJECT_PULL_REQUESTS_CHANNEL,
  GET_REPO_DETAILS_CHANNEL,
  PICK_REPO_DIRECTORY_CHANNEL,
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
  getRepoDetails: (projectPath) =>
    ipcRenderer.invoke(GET_REPO_DETAILS_CHANNEL, projectPath),
};
