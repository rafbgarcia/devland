import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDefaultTargetBrowserTabsState,
  getDefaultBrowserTabId,
  reduceStoredBrowserTabsState,
  sanitizeStoredBrowserTabsState,
} from '@/renderer/code-screen/use-browser-tabs';

describe('sanitizeStoredBrowserTabsState', () => {
  it('drops malformed repo and target entries', () => {
    assert.deepEqual(
      sanitizeStoredBrowserTabsState({
        devland: {
          alpha: {
            activeTabId: '',
            tabs: [{ id: '' }],
          },
        },
        '': {
          beta: {
            activeTabId: 'beta:browser:1',
            tabs: [{ id: 'beta:browser:1' }],
          },
        },
      }),
      {
        devland: {
          alpha: createDefaultTargetBrowserTabsState('alpha'),
        },
      },
    );
  });
});

describe('reduceStoredBrowserTabsState', () => {
  it('stores non-default tab layouts for a target', () => {
    const state = reduceStoredBrowserTabsState(
      {},
      {
        type: 'update-target',
        repoId: 'devland',
        targetId: 'target-1',
        updater: (current) => ({
          activeTabId: 'tab-2',
          tabs: [...current.tabs, { id: 'tab-2' }],
        }),
      },
    );

    assert.deepEqual(state, {
      devland: {
        'target-1': {
          activeTabId: 'tab-2',
          tabs: [
            { id: getDefaultBrowserTabId('target-1') },
            { id: 'tab-2' },
          ],
        },
      },
    });
  });

  it('removes a target entry when it returns to the default layout', () => {
    const state = reduceStoredBrowserTabsState(
      {
        devland: {
          'target-1': {
            activeTabId: 'tab-2',
            tabs: [
              { id: getDefaultBrowserTabId('target-1') },
              { id: 'tab-2' },
            ],
          },
        },
      },
      {
        type: 'update-target',
        repoId: 'devland',
        targetId: 'target-1',
        updater: () => createDefaultTargetBrowserTabsState('target-1'),
      },
    );

    assert.deepEqual(state, {});
  });

  it('removes a single target without affecting siblings', () => {
    const state = reduceStoredBrowserTabsState(
      {
        devland: {
          'target-1': {
            activeTabId: 'tab-2',
            tabs: [
              { id: getDefaultBrowserTabId('target-1') },
              { id: 'tab-2' },
            ],
          },
          'target-2': {
            activeTabId: 'tab-3',
            tabs: [
              { id: getDefaultBrowserTabId('target-2') },
              { id: 'tab-3' },
            ],
          },
        },
      },
      {
        type: 'remove-target',
        repoId: 'devland',
        targetId: 'target-1',
      },
    );

    assert.deepEqual(state, {
      devland: {
        'target-2': {
          activeTabId: 'tab-3',
          tabs: [
            { id: getDefaultBrowserTabId('target-2') },
            { id: 'tab-3' },
          ],
        },
      },
    });
  });

  it('prunes stale target state for removed code targets', () => {
    const state = reduceStoredBrowserTabsState(
      {
        devland: {
          'target-1': {
            activeTabId: 'tab-2',
            tabs: [
              { id: getDefaultBrowserTabId('target-1') },
              { id: 'tab-2' },
            ],
          },
          'target-2': {
            activeTabId: 'tab-3',
            tabs: [
              { id: getDefaultBrowserTabId('target-2') },
              { id: 'tab-3' },
            ],
          },
        },
      },
      {
        type: 'prune-targets',
        repoId: 'devland',
        targetIds: ['target-2'],
      },
    );

    assert.deepEqual(state, {
      devland: {
        'target-2': {
          activeTabId: 'tab-3',
          tabs: [
            { id: getDefaultBrowserTabId('target-2') },
            { id: 'tab-3' },
          ],
        },
      },
    });
  });
});
