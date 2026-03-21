import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getVisibleGitAsyncState } from './use-git';

describe('getVisibleGitAsyncState', () => {
  it('masks stale ready data from a previous repo path', () => {
    const visibleState = getVisibleGitAsyncState('/repo/worktree', {
      repoPath: '/repo/root',
      status: 'ready',
      data: { branch: 'main' },
      error: null,
      refreshVersion: 3,
    });

    assert.deepEqual(visibleState, {
      repoPath: '/repo/worktree',
      status: 'loading',
      data: null,
      error: null,
      refreshVersion: 0,
    });
  });

  it('preserves state for the active repo path', () => {
    const visibleState = getVisibleGitAsyncState('/repo/worktree', {
      repoPath: '/repo/worktree',
      status: 'ready',
      data: { branch: 'feature/onboarding' },
      error: null,
      refreshVersion: 1,
    });

    assert.deepEqual(visibleState, {
      repoPath: '/repo/worktree',
      status: 'ready',
      data: { branch: 'feature/onboarding' },
      error: null,
      refreshVersion: 1,
    });
  });
});
