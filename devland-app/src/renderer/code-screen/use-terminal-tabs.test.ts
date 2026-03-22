import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDefaultTargetTerminalTabsState,
  getDefaultTerminalTabId,
  reduceStoredTerminalTabsState,
  sanitizeStoredTerminalTabsState,
} from '@/renderer/code-screen/use-terminal-tabs';

describe('sanitizeStoredTerminalTabsState', () => {
  it('drops malformed repo and target entries', () => {
    assert.deepEqual(
      sanitizeStoredTerminalTabsState({
        devland: {
          alpha: {
            activeTabId: '',
            tabs: [{ id: '', title: 'Terminal 1' }],
          },
        },
        '': {
          beta: {
            activeTabId: 'beta:terminal:1',
            tabs: [{ id: 'beta:terminal:1', title: 'Terminal 1' }],
          },
        },
      }),
      {
        devland: {
          alpha: createDefaultTargetTerminalTabsState('alpha'),
        },
      },
    );
  });
});

describe('reduceStoredTerminalTabsState', () => {
  it('preserves renamed titles for the default tab id', () => {
    assert.deepEqual(
      sanitizeStoredTerminalTabsState({
        devland: {
          'target-1': {
            activeTabId: getDefaultTerminalTabId('target-1'),
            tabs: [
              { id: getDefaultTerminalTabId('target-1'), title: 'API Server' },
            ],
          },
        },
      }),
      {
        devland: {
          'target-1': {
            activeTabId: getDefaultTerminalTabId('target-1'),
            tabs: [
              { id: getDefaultTerminalTabId('target-1'), title: 'API Server' },
            ],
          },
        },
      },
    );
  });

  it('stores non-default tab layouts for a target', () => {
    const state = reduceStoredTerminalTabsState(
      {},
      {
        type: 'update-target',
        repoId: 'devland',
        targetId: 'target-1',
        updater: (current) => ({
          activeTabId: 'tab-2',
          tabs: [
            ...current.tabs,
            { id: 'tab-2', title: 'Terminal 2' },
          ],
        }),
      },
    );

    assert.deepEqual(state, {
      devland: {
        'target-1': {
          activeTabId: 'tab-2',
          tabs: [
            { id: getDefaultTerminalTabId('target-1'), title: 'Terminal 1' },
            { id: 'tab-2', title: 'Terminal 2' },
          ],
        },
      },
    });
  });

  it('removes a target entry when it returns to the default layout', () => {
    const state = reduceStoredTerminalTabsState(
      {
        devland: {
          'target-1': {
            activeTabId: 'tab-2',
            tabs: [
              { id: getDefaultTerminalTabId('target-1'), title: 'Terminal 1' },
              { id: 'tab-2', title: 'Terminal 2' },
            ],
          },
        },
      },
      {
        type: 'update-target',
        repoId: 'devland',
        targetId: 'target-1',
        updater: () => createDefaultTargetTerminalTabsState('target-1'),
      },
    );

    assert.deepEqual(state, {});
  });

  it('removes a single target without affecting siblings', () => {
    const state = reduceStoredTerminalTabsState(
      {
        devland: {
          'target-1': {
            activeTabId: 'tab-2',
            tabs: [
              { id: getDefaultTerminalTabId('target-1'), title: 'Terminal 1' },
              { id: 'tab-2', title: 'Terminal 2' },
            ],
          },
          'target-2': {
            activeTabId: 'tab-3',
            tabs: [
              { id: getDefaultTerminalTabId('target-2'), title: 'Terminal 1' },
              { id: 'tab-3', title: 'Terminal 2' },
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
            { id: getDefaultTerminalTabId('target-2'), title: 'Terminal 1' },
            { id: 'tab-3', title: 'Terminal 2' },
          ],
        },
      },
    });
  });

  it('prunes stale target state for removed code targets', () => {
    const state = reduceStoredTerminalTabsState(
      {
        devland: {
          'target-1': {
            activeTabId: 'tab-2',
            tabs: [
              { id: getDefaultTerminalTabId('target-1'), title: 'Terminal 1' },
              { id: 'tab-2', title: 'Terminal 2' },
            ],
          },
          'target-2': {
            activeTabId: 'tab-3',
            tabs: [
              { id: getDefaultTerminalTabId('target-2'), title: 'Terminal 1' },
              { id: 'tab-3', title: 'Terminal 2' },
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
            { id: getDefaultTerminalTabId('target-2'), title: 'Terminal 1' },
            { id: 'tab-3', title: 'Terminal 2' },
          ],
        },
      },
    });
  });

  it('stores renamed tab titles', () => {
    const state = reduceStoredTerminalTabsState(
      {},
      {
        type: 'update-target',
        repoId: 'devland',
        targetId: 'target-1',
        updater: (current) => ({
          ...current,
          tabs: current.tabs.map((tab) =>
            tab.id === getDefaultTerminalTabId('target-1')
              ? { ...tab, title: 'API Server' }
              : tab,
          ),
        }),
      },
    );

    assert.deepEqual(state, {
      devland: {
        'target-1': {
          activeTabId: getDefaultTerminalTabId('target-1'),
          tabs: [
            { id: getDefaultTerminalTabId('target-1'), title: 'API Server' },
          ],
        },
      },
    });
  });
});
