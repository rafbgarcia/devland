import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CodeTarget } from '@/ipc/contracts';

import { formatCodeTargetLabel } from './code-target-label';

const createTarget = (overrides: Partial<CodeTarget>): CodeTarget => ({
  id: 'target-1',
  repoId: 'repo-1',
  kind: 'root',
  cwd: '/repo',
  title: 'Current branch',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('formatCodeTargetLabel', () => {
  it('prefers the current thread name for any target kind', () => {
    assert.equal(
      formatCodeTargetLabel({
        target: createTarget({ kind: 'root' }),
        rootBranch: 'main',
        threadName: 'Investigate naming flow',
      }),
      'Investigate naming flow',
    );
    assert.equal(
      formatCodeTargetLabel({
        target: createTarget({ kind: 'worktree', title: 'feature/naming' }),
        rootBranch: 'main',
        threadName: 'Investigate naming flow',
      }),
      'Investigate naming flow',
    );
  });

  it('falls back to the current branch for the root target', () => {
    assert.equal(
      formatCodeTargetLabel({
        target: createTarget({ kind: 'root' }),
        rootBranch: 'main',
        threadName: null,
      }),
      'main',
    );
  });

  it('falls back to numbered branch labels for extra current-branch sessions', () => {
    assert.equal(
      formatCodeTargetLabel({
        target: createTarget({ kind: 'session', title: 'Session 1' }),
        rootBranch: 'main',
        threadName: null,
      }),
      'main.2',
    );
  });

  it('falls back to the stored worktree branch name', () => {
    assert.equal(
      formatCodeTargetLabel({
        target: createTarget({ kind: 'worktree', title: 'feature/naming' }),
        rootBranch: 'main',
        threadName: null,
      }),
      'feature/naming',
    );
  });
});
