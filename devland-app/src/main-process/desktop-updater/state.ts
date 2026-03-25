import type { DesktopUpdateState } from '@/ipc/contracts';

export function createInitialDesktopUpdateState(currentVersion: string): DesktopUpdateState {
  return {
    enabled: false,
    status: 'disabled',
    currentVersion,
    availableVersion: null,
    downloadedVersion: null,
    checkedAt: null,
    downloadPercent: null,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

export function getAutoUpdateDisabledReason(args: {
  isPackaged: boolean;
  platform: NodeJS.Platform;
  appImage?: string | undefined;
  disabledByEnv: boolean;
  repositoryConfigured: boolean;
}): string | null {
  if (!args.isPackaged) {
    return 'Automatic updates are only available in packaged production builds.';
  }
  if (args.disabledByEnv) {
    return 'Automatic updates are disabled by the DEVLAND_DISABLE_AUTO_UPDATE setting.';
  }
  if (!args.repositoryConfigured) {
    return 'Automatic updates are not configured for this build.';
  }
  if (args.platform === 'linux' && !args.appImage) {
    return 'Automatic updates on Linux require running the AppImage build.';
  }
  return null;
}

export function reduceDesktopUpdateStateOnConfigure(
  state: DesktopUpdateState,
  enabled: boolean,
  message: string | null,
): DesktopUpdateState {
  return {
    ...state,
    enabled,
    status: enabled ? 'idle' : 'disabled',
    message,
    checkedAt: null,
    downloadPercent: null,
    errorContext: null,
    canRetry: false,
  };
}

export function reduceDesktopUpdateStateOnCheckStart(
  state: DesktopUpdateState,
  checkedAt: string,
): DesktopUpdateState {
  return {
    ...state,
    status: 'checking',
    checkedAt,
    downloadPercent: null,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

export function reduceDesktopUpdateStateOnCheckFailure(
  state: DesktopUpdateState,
  message: string,
  checkedAt: string,
): DesktopUpdateState {
  return {
    ...state,
    status: 'error',
    checkedAt,
    downloadPercent: null,
    message,
    errorContext: 'check',
    canRetry: true,
  };
}

export function reduceDesktopUpdateStateOnNoUpdate(
  state: DesktopUpdateState,
  checkedAt: string,
): DesktopUpdateState {
  return {
    ...state,
    status: 'up-to-date',
    availableVersion: null,
    downloadedVersion: null,
    checkedAt,
    downloadPercent: null,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

export function reduceDesktopUpdateStateOnUpdateAvailable(
  state: DesktopUpdateState,
  version: string,
  checkedAt: string,
): DesktopUpdateState {
  return {
    ...state,
    status: 'available',
    availableVersion: version,
    downloadedVersion: null,
    checkedAt,
    downloadPercent: null,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

export function reduceDesktopUpdateStateOnDownloadStart(
  state: DesktopUpdateState,
): DesktopUpdateState {
  return {
    ...state,
    status: 'downloading',
    downloadPercent: 0,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

export function reduceDesktopUpdateStateOnDownloadProgress(
  state: DesktopUpdateState,
  percent: number,
): DesktopUpdateState {
  return {
    ...state,
    status: 'downloading',
    downloadPercent: percent,
    message: null,
    errorContext: null,
    canRetry: false,
  };
}

export function reduceDesktopUpdateStateOnDownloadFailure(
  state: DesktopUpdateState,
  message: string,
): DesktopUpdateState {
  return {
    ...state,
    status: state.availableVersion ? 'available' : 'error',
    downloadPercent: null,
    message,
    errorContext: 'download',
    canRetry: state.availableVersion !== null,
  };
}

export function reduceDesktopUpdateStateOnDownloadComplete(
  state: DesktopUpdateState,
  version: string,
): DesktopUpdateState {
  return {
    ...state,
    status: 'downloaded',
    availableVersion: version,
    downloadedVersion: version,
    downloadPercent: 100,
    message: null,
    errorContext: null,
    canRetry: true,
  };
}

export function reduceDesktopUpdateStateOnInstallFailure(
  state: DesktopUpdateState,
  message: string,
): DesktopUpdateState {
  return {
    ...state,
    status: 'downloaded',
    message,
    errorContext: 'install',
    canRetry: true,
  };
}

export function shouldBroadcastDownloadProgress(
  currentState: DesktopUpdateState,
  nextPercent: number,
): boolean {
  if (currentState.status !== 'downloading') {
    return true;
  }

  if (currentState.downloadPercent === null) {
    return true;
  }

  const currentStep = Math.floor(currentState.downloadPercent / 10);
  const nextStep = Math.floor(nextPercent / 10);

  return currentStep !== nextStep || nextPercent === 100;
}
