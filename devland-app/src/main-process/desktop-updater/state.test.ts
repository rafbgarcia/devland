import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createInitialDesktopUpdateState,
  getAutoUpdateDisabledReason,
  reduceDesktopUpdateStateOnDownloadComplete,
  reduceDesktopUpdateStateOnDownloadFailure,
  reduceDesktopUpdateStateOnDownloadProgress,
  reduceDesktopUpdateStateOnDownloadStart,
  shouldBroadcastDownloadProgress,
} from '@/main-process/desktop-updater/state';

describe('desktop updater state', () => {
  it('reports packaged-build requirement first', () => {
    assert.equal(
      getAutoUpdateDisabledReason({
        isPackaged: false,
        platform: 'darwin',
        disabledByEnv: false,
        repositoryConfigured: true,
      }),
      'Automatic updates are only available in packaged production builds.',
    );
  });

  it('reports missing repository configuration', () => {
    assert.equal(
      getAutoUpdateDisabledReason({
        isPackaged: true,
        platform: 'win32',
        disabledByEnv: false,
        repositoryConfigured: false,
      }),
      'Automatic updates are not configured for this build.',
    );
  });

  it('requires AppImage on linux', () => {
    assert.equal(
      getAutoUpdateDisabledReason({
        isPackaged: true,
        platform: 'linux',
        appImage: undefined,
        disabledByEnv: false,
        repositoryConfigured: true,
      }),
      'Automatic updates on Linux require running the AppImage build.',
    );
  });

  it('restores available state after a download failure', () => {
    const state = reduceDesktopUpdateStateOnDownloadStart({
      ...createInitialDesktopUpdateState('1.0.0'),
      enabled: true,
      status: 'available',
      availableVersion: '1.1.0',
    });

    assert.deepEqual(reduceDesktopUpdateStateOnDownloadFailure(state, 'nope'), {
      ...state,
      status: 'available',
      downloadPercent: null,
      message: 'nope',
      errorContext: 'download',
      canRetry: true,
    });
  });

  it('marks the update as downloaded when finished', () => {
    const state = reduceDesktopUpdateStateOnDownloadProgress(
      reduceDesktopUpdateStateOnDownloadStart({
        ...createInitialDesktopUpdateState('1.0.0'),
        enabled: true,
        status: 'available',
        availableVersion: '1.1.0',
      }),
      50,
    );

    assert.deepEqual(reduceDesktopUpdateStateOnDownloadComplete(state, '1.1.0'), {
      ...state,
      status: 'downloaded',
      availableVersion: '1.1.0',
      downloadedVersion: '1.1.0',
      downloadPercent: 100,
      message: null,
      errorContext: null,
      canRetry: true,
    });
  });

  it('only broadcasts download progress on new 10% buckets', () => {
    const state = {
      ...createInitialDesktopUpdateState('1.0.0'),
      enabled: true,
      status: 'downloading' as const,
      downloadPercent: 24,
    };

    assert.equal(shouldBroadcastDownloadProgress(state, 29), false);
    assert.equal(shouldBroadcastDownloadProgress(state, 30), true);
  });
});
