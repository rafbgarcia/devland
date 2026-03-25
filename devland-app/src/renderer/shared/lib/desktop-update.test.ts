import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DesktopUpdateState } from '@/ipc/contracts';
import {
  getDesktopUpdateActionError,
  getDesktopUpdateButtonLabel,
  getDesktopUpdateButtonTooltip,
  resolveDesktopUpdateButtonAction,
  shouldShowDesktopUpdateButton,
} from '@/renderer/shared/lib/desktop-update';

const baseState = (): DesktopUpdateState => ({
  enabled: true,
  status: 'idle',
  currentVersion: '1.0.0',
  availableVersion: null,
  downloadedVersion: null,
  checkedAt: null,
  downloadPercent: null,
  message: null,
  errorContext: null,
  canRetry: false,
});

describe('desktop update renderer helpers', () => {
  it('shows a download action for available updates', () => {
    const state = {
      ...baseState(),
      status: 'available' as const,
      availableVersion: '1.1.0',
    };

    assert.equal(resolveDesktopUpdateButtonAction(state), 'download');
    assert.equal(getDesktopUpdateButtonLabel(state), 'Update');
    assert.equal(shouldShowDesktopUpdateButton(state), true);
  });

  it('shows progress while downloading', () => {
    const state = {
      ...baseState(),
      status: 'downloading' as const,
      availableVersion: '1.1.0',
      downloadPercent: 42,
    };

    assert.equal(getDesktopUpdateButtonLabel(state), 'Downloading 42%');
    assert.match(getDesktopUpdateButtonTooltip(state), /42%/);
    assert.equal(shouldShowDesktopUpdateButton(state), true);
  });

  it('shows restart copy after download', () => {
    const state = {
      ...baseState(),
      status: 'downloaded' as const,
      availableVersion: '1.1.0',
      downloadedVersion: '1.1.0',
      downloadPercent: 100,
    };

    assert.equal(resolveDesktopUpdateButtonAction(state), 'install');
    assert.equal(getDesktopUpdateButtonLabel(state), 'Restart to update');
  });

  it('surfaces action errors only for incomplete accepted actions', () => {
    assert.equal(
      getDesktopUpdateActionError({
        accepted: true,
        completed: false,
        state: {
          ...baseState(),
          status: 'available',
          message: 'Network error',
        },
      }),
      'Network error',
    );
    assert.equal(
      getDesktopUpdateActionError({
        accepted: false,
        completed: false,
        state: baseState(),
      }),
      null,
    );
  });
});
