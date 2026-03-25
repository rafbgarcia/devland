import type {
  DesktopUpdateActionResult,
  DesktopUpdateState,
} from '@/ipc/contracts';

export type DesktopUpdateButtonAction = 'download' | 'install' | 'none';

export function resolveDesktopUpdateButtonAction(
  state: DesktopUpdateState,
): DesktopUpdateButtonAction {
  if (state.status === 'available') {
    return 'download';
  }

  if (state.status === 'downloaded') {
    return 'install';
  }

  return 'none';
}

export function shouldShowDesktopUpdateButton(
  state: DesktopUpdateState | null,
): boolean {
  if (!state || !state.enabled) {
    return false;
  }

  return (
    state.status === 'available' ||
    state.status === 'downloading' ||
    state.status === 'downloaded'
  );
}

export function isDesktopUpdateButtonDisabled(
  state: DesktopUpdateState | null,
): boolean {
  return state?.status === 'downloading';
}

export function getDesktopUpdateButtonLabel(state: DesktopUpdateState): string {
  if (state.status === 'available') {
    return 'Update available';
  }

  if (state.status === 'downloading') {
    const progress = typeof state.downloadPercent === 'number'
      ? ` ${Math.floor(state.downloadPercent)}%`
      : '';

    return `Downloading${progress}`;
  }

  if (state.status === 'downloaded') {
    return 'Restart to update';
  }

  return 'Update';
}

export function getDesktopUpdateButtonTooltip(state: DesktopUpdateState): string {
  if (state.status === 'available') {
    return `Version ${state.availableVersion ?? 'available'} is ready to download.`;
  }

  if (state.status === 'downloading') {
    return typeof state.downloadPercent === 'number'
      ? `Downloading version ${state.availableVersion ?? 'update'} (${Math.floor(state.downloadPercent)}%).`
      : 'Downloading update.';
  }

  if (state.status === 'downloaded') {
    return `Version ${state.downloadedVersion ?? state.availableVersion ?? 'update'} is downloaded. Restart Devland to install it.`;
  }

  return state.message ?? 'Update available.';
}

export function getDesktopUpdateActionError(
  result: DesktopUpdateActionResult,
): string | null {
  if (!result.accepted || result.completed) {
    return null;
  }

  return result.state.message;
}
