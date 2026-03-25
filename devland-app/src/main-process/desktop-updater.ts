import { BrowserWindow, app } from 'electron';
import { autoUpdater } from 'electron-updater';

import type {
  DesktopUpdateActionResult,
  DesktopUpdateState,
} from '@/ipc/contracts';
import { UPDATE_STATE_CHANNEL } from '@/ipc/contracts';
import {
  createInitialDesktopUpdateState,
  getAutoUpdateDisabledReason,
  reduceDesktopUpdateStateOnCheckFailure,
  reduceDesktopUpdateStateOnCheckStart,
  reduceDesktopUpdateStateOnConfigure,
  reduceDesktopUpdateStateOnDownloadComplete,
  reduceDesktopUpdateStateOnDownloadFailure,
  reduceDesktopUpdateStateOnDownloadProgress,
  reduceDesktopUpdateStateOnDownloadStart,
  reduceDesktopUpdateStateOnInstallFailure,
  reduceDesktopUpdateStateOnNoUpdate,
  reduceDesktopUpdateStateOnUpdateAvailable,
  shouldBroadcastDownloadProgress,
} from './desktop-updater/state';

const AUTO_UPDATE_STARTUP_DELAY_MS = 15_000;
const AUTO_UPDATE_POLL_INTERVAL_MS = 4 * 60 * 60 * 1000;
const DEFAULT_UPDATE_REPOSITORY = 'rafbgarcia/devland';

type MainWindowProvider = () => BrowserWindow | null;

let mainWindowProvider: MainWindowProvider = () => null;
let started = false;
let updaterConfigured = false;
let updateCheckInFlight = false;
let updateDownloadInFlight = false;
let isInstallingUpdate = false;
let updatePollTimer: ReturnType<typeof setInterval> | null = null;
let updateStartupTimer: ReturnType<typeof setTimeout> | null = null;
let updateState: DesktopUpdateState = createInitialDesktopUpdateState(app.getVersion());

function nowIso(): string {
  return new Date().toISOString();
}

function broadcastUpdateState(): void {
  const mainWindow = mainWindowProvider();

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(UPDATE_STATE_CHANNEL, updateState);
}

function setUpdateState(nextState: DesktopUpdateState): void {
  updateState = nextState;
  broadcastUpdateState();
}

function resolveUpdaterErrorContext(): 'check' | 'download' | 'install' {
  if (updateDownloadInFlight) {
    return 'download';
  }

  if (isInstallingUpdate || updateState.status === 'downloaded') {
    return 'install';
  }

  return 'check';
}

function setUpdaterErrorState(message: string): void {
  const errorContext = resolveUpdaterErrorContext();

  if (errorContext === 'download') {
    setUpdateState(reduceDesktopUpdateStateOnDownloadFailure(updateState, message));
    return;
  }

  if (errorContext === 'install') {
    setUpdateState(reduceDesktopUpdateStateOnInstallFailure(updateState, message));
    return;
  }

  setUpdateState(reduceDesktopUpdateStateOnCheckFailure(updateState, message, nowIso()));
}

function clearUpdateTimers(): void {
  if (updateStartupTimer !== null) {
    clearTimeout(updateStartupTimer);
    updateStartupTimer = null;
  }

  if (updatePollTimer !== null) {
    clearInterval(updatePollTimer);
    updatePollTimer = null;
  }
}

function parseUpdateRepository(
  repository: string | undefined,
): { owner: string; repo: string } | null {
  const trimmed = repository?.trim() ?? '';

  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  return { owner: match[1], repo: match[2] };
}

function getConfiguredUpdateRepository(): { owner: string; repo: string } | null {
  return parseUpdateRepository(
    process.env.DEVLAND_UPDATE_REPOSITORY ??
      process.env.DEVLAND_DESKTOP_UPDATE_REPOSITORY ??
      DEFAULT_UPDATE_REPOSITORY,
  );
}

function shouldEnableAutoUpdates(): { enabled: boolean; message: string | null } {
  const repository = getConfiguredUpdateRepository();
  const message = getAutoUpdateDisabledReason({
    isPackaged: app.isPackaged,
    platform: process.platform,
    appImage: process.env.APPIMAGE,
    disabledByEnv: process.env.DEVLAND_DISABLE_AUTO_UPDATE === 'true',
    repositoryConfigured: repository !== null,
  });

  return {
    enabled: message === null,
    message,
  };
}

function configureFeedUrl(): void {
  const repository = getConfiguredUpdateRepository();

  if (repository === null) {
    return;
  }

  const githubToken = process.env.DEVLAND_UPDATE_GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: repository.owner,
    repo: repository.repo,
    releaseType: 'release',
    ...(githubToken
      ? {
          private: true,
          token: githubToken,
        }
      : {}),
  });
}

function canDownloadUpdate(state: DesktopUpdateState): boolean {
  if (state.status === 'available') {
    return true;
  }

  return state.status === 'error' &&
    state.errorContext === 'download' &&
    state.availableVersion !== null;
}

function canInstallUpdate(state: DesktopUpdateState): boolean {
  return state.status === 'downloaded';
}

async function checkForUpdates(reason: string): Promise<void> {
  if (!updaterConfigured || updateCheckInFlight || isInstallingUpdate) {
    return;
  }

  if (updateState.status === 'downloading' || updateState.status === 'downloaded') {
    console.info(`[desktop-updater] skipping check (${reason}) while status=${updateState.status}`);
    return;
  }

  updateCheckInFlight = true;
  setUpdateState(reduceDesktopUpdateStateOnCheckStart(updateState, nowIso()));

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setUpdaterErrorState(message);
    console.error(`[desktop-updater] failed to check for updates: ${message}`);
  } finally {
    updateCheckInFlight = false;
  }
}

async function downloadAvailableUpdate(): Promise<DesktopUpdateActionResult> {
  if (!updaterConfigured || updateDownloadInFlight || !canDownloadUpdate(updateState)) {
    return {
      accepted: false,
      completed: false,
      state: updateState,
    };
  }

  updateDownloadInFlight = true;
  setUpdateState(reduceDesktopUpdateStateOnDownloadStart(updateState));

  try {
    await autoUpdater.downloadUpdate();

    return {
      accepted: true,
      completed: true,
      state: updateState,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setUpdaterErrorState(message);
    console.error(`[desktop-updater] failed to download update: ${message}`);

    return {
      accepted: true,
      completed: false,
      state: updateState,
    };
  } finally {
    updateDownloadInFlight = false;
  }
}

async function installDownloadedUpdate(): Promise<DesktopUpdateActionResult> {
  if (!updaterConfigured || isInstallingUpdate || !canInstallUpdate(updateState)) {
    return {
      accepted: false,
      completed: false,
      state: updateState,
    };
  }

  isInstallingUpdate = true;
  clearUpdateTimers();

  try {
    autoUpdater.quitAndInstall();

    return {
      accepted: true,
      completed: true,
      state: updateState,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    isInstallingUpdate = false;
    setUpdaterErrorState(message);
    console.error(`[desktop-updater] failed to install update: ${message}`);

    return {
      accepted: true,
      completed: false,
      state: updateState,
    };
  }
}

function registerAutoUpdaterListeners(): void {
  autoUpdater.removeAllListeners();

  autoUpdater.on('update-available', (info) => {
    setUpdateState(reduceDesktopUpdateStateOnUpdateAvailable(updateState, info.version, nowIso()));
    console.info(`[desktop-updater] update available: ${info.version}`);
  });

  autoUpdater.on('update-not-available', () => {
    setUpdateState(reduceDesktopUpdateStateOnNoUpdate(updateState, nowIso()));
    console.info('[desktop-updater] no updates available');
  });

  autoUpdater.on('download-progress', (progress) => {
    if (
      shouldBroadcastDownloadProgress(updateState, progress.percent) ||
      updateState.message !== null
    ) {
      setUpdateState(reduceDesktopUpdateStateOnDownloadProgress(updateState, progress.percent));
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    setUpdateState(reduceDesktopUpdateStateOnDownloadComplete(updateState, info.version));
    console.info(`[desktop-updater] update downloaded: ${info.version}`);
  });

  autoUpdater.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error);

    if (!updateCheckInFlight && !updateDownloadInFlight) {
      setUpdaterErrorState(message);
    }

    console.error(`[desktop-updater] updater error: ${message}`);
  });
}

export const desktopUpdater = {
  setMainWindowProvider(provider: MainWindowProvider): void {
    mainWindowProvider = provider;
  },

  getState(): DesktopUpdateState {
    return updateState;
  },

  async downloadUpdate(): Promise<DesktopUpdateActionResult> {
    return downloadAvailableUpdate();
  },

  async installUpdate(): Promise<DesktopUpdateActionResult> {
    return installDownloadedUpdate();
  },

  start(): void {
    if (started) {
      return;
    }

    started = true;

    const { enabled, message } = shouldEnableAutoUpdates();

    setUpdateState(
      reduceDesktopUpdateStateOnConfigure(
        createInitialDesktopUpdateState(app.getVersion()),
        enabled,
        message,
      ),
    );

    if (!enabled) {
      return;
    }

    updaterConfigured = true;
    configureFeedUrl();
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    registerAutoUpdaterListeners();

    updateStartupTimer = setTimeout(() => {
      updateStartupTimer = null;
      void checkForUpdates('startup');
    }, AUTO_UPDATE_STARTUP_DELAY_MS);
    updateStartupTimer.unref();

    updatePollTimer = setInterval(() => {
      void checkForUpdates('poll');
    }, AUTO_UPDATE_POLL_INTERVAL_MS);
    updatePollTimer.unref();
  },

  dispose(): void {
    clearUpdateTimers();
    autoUpdater.removeAllListeners();
    updateCheckInFlight = false;
    updateDownloadInFlight = false;
  },
};
