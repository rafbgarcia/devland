import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  areWorkspaceSessionsEqual,
  DEFAULT_REPO_WORKSPACE_STATE,
  DEFAULT_WORKSPACE_SESSION,
  getRememberedCodePaneId,
  getRememberedCodeTargetId,
  getRememberedProjectTabId,
  getRepoWorkspaceState,
  rememberCodePane,
  rememberCodeTarget,
  rememberProjectTab,
  sanitizeWorkspaceSession,
} from '@/renderer/shared/lib/workspace-view-state';
import { toProjectExtensionTabId } from '@/renderer/shared/lib/projects';

describe('sanitizeWorkspaceSession', () => {
  it('keeps the current nested repo view shape', () => {
    assert.deepEqual(
      sanitizeWorkspaceSession({
        activeRepoId: 'devland',
        repoViewById: {
          devland: {
            activeTabId: 'pull-requests',
            activeCodeTargetId: 'target-1',
            activeCodePaneId: 'terminal',
          },
        },
      }),
      {
        activeRepoId: 'devland',
        repoViewById: {
          devland: {
            activeTabId: 'pull-requests',
            activeCodeTargetId: 'target-1',
            activeCodePaneId: 'terminal',
          },
        },
      },
    );
  });

  it('sanitizes malformed nested repo view state', () => {
    assert.deepEqual(
      sanitizeWorkspaceSession({
        activeRepoId: 'devland',
        repoViewById: {
          devland: {
            activeTabId: 'not-a-tab',
            activeCodeTargetId: '',
            activeCodePaneId: 'not-a-pane',
          },
          '': {
            activeTabId: 'issues',
          },
        },
      }),
      {
        activeRepoId: 'devland',
        repoViewById: {
          devland: DEFAULT_REPO_WORKSPACE_STATE,
        },
      },
    );
  });

  it('falls back to the default session for malformed values', () => {
    assert.deepEqual(sanitizeWorkspaceSession(null), DEFAULT_WORKSPACE_SESSION);
  });
});

describe('repo view helpers', () => {
  it('returns defaults for repos without remembered state', () => {
    assert.deepEqual(
      getRepoWorkspaceState(DEFAULT_WORKSPACE_SESSION, 'devland'),
      DEFAULT_REPO_WORKSPACE_STATE,
    );
  });

  it('remembers project tabs per repo, including extension tabs', () => {
    const session = rememberProjectTab(
      DEFAULT_WORKSPACE_SESSION,
      'devland',
      toProjectExtensionTabId('gh-prs'),
    );

    assert.equal(
      getRememberedProjectTabId(session, 'devland'),
      toProjectExtensionTabId('gh-prs'),
    );
    assert.equal(session.activeRepoId, 'devland');
  });

  it('remembers the active code target per repo', () => {
    const session = rememberCodeTarget(DEFAULT_WORKSPACE_SESSION, 'devland', 'target-1');

    assert.equal(getRememberedCodeTargetId(session, 'devland'), 'target-1');
  });

  it('remembers the active code pane per repo', () => {
    const session = rememberCodePane(DEFAULT_WORKSPACE_SESSION, 'devland', 'browser');

    assert.equal(getRememberedCodePaneId(session, 'devland'), 'browser');
  });

  it('returns the same object when a remembered code pane does not change', () => {
    const session = rememberCodePane(DEFAULT_WORKSPACE_SESSION, 'devland', 'codex');

    assert.equal(rememberCodePane(session, 'devland', 'codex'), session);
  });
});

describe('areWorkspaceSessionsEqual', () => {
  it('compares nested repo view state', () => {
    const left = rememberCodePane(
      rememberCodeTarget(
        rememberProjectTab(DEFAULT_WORKSPACE_SESSION, 'devland', 'pull-requests'),
        'devland',
        'target-1',
      ),
      'devland',
      'terminal',
    );
    const right = sanitizeWorkspaceSession({
      activeRepoId: 'devland',
      repoViewById: {
        devland: {
          activeTabId: 'pull-requests',
          activeCodeTargetId: 'target-1',
          activeCodePaneId: 'terminal',
        },
      },
    });

    assert.equal(areWorkspaceSessionsEqual(left, right), true);
  });
});
