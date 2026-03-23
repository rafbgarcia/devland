import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CodeTarget } from '@/ipc/contracts';
import {
  getAdjacentCodePaneId,
  getAdjacentCodeTargetId,
  getCodeTargetIdAfterClose,
  getRootCodeTargetId,
  isRootCodeTargetId,
} from '@/renderer/shared/lib/workspace-shortcuts';

const targets: CodeTarget[] = [
  {
    id: 'repo-1:root',
    repoId: 'repo-1',
    kind: 'root',
    cwd: '/tmp/repo-1',
    title: 'Current branch',
    createdAt: '1',
  },
  {
    id: 'session-1',
    repoId: 'repo-1',
    kind: 'session',
    cwd: '/tmp/repo-1',
    title: 'Session 1',
    createdAt: '2',
  },
  {
    id: 'worktree-1',
    repoId: 'repo-1',
    kind: 'worktree',
    cwd: '/tmp/repo-1-worktree',
    title: 'feature/one',
    createdAt: '3',
  },
];

describe('getAdjacentCodePaneId', () => {
  it('cycles forward and backward across panes', () => {
    assert.equal(getAdjacentCodePaneId('changes', 'next'), 'codex');
    assert.equal(getAdjacentCodePaneId('changes', 'previous'), 'terminal');
    assert.equal(getAdjacentCodePaneId('terminal', 'next'), 'changes');
  });
});

describe('getAdjacentCodeTargetId', () => {
  it('cycles across code targets and wraps around', () => {
    assert.equal(getAdjacentCodeTargetId(targets, 'repo-1:root', 'next'), 'session-1');
    assert.equal(getAdjacentCodeTargetId(targets, 'repo-1:root', 'previous'), 'worktree-1');
    assert.equal(getAdjacentCodeTargetId(targets, 'worktree-1', 'next'), 'repo-1:root');
  });

  it('falls back to the first or last target when the current one is unknown', () => {
    assert.equal(getAdjacentCodeTargetId(targets, 'missing', 'next'), 'repo-1:root');
    assert.equal(getAdjacentCodeTargetId(targets, 'missing', 'previous'), 'worktree-1');
  });
});

describe('getCodeTargetIdAfterClose', () => {
  it('prefers the next target when closing the active target', () => {
    assert.equal(getCodeTargetIdAfterClose(targets, 'session-1'), 'worktree-1');
  });

  it('falls back to the previous target when closing the last target', () => {
    assert.equal(getCodeTargetIdAfterClose(targets, 'worktree-1'), 'session-1');
  });

  it('returns null when the closing target cannot be found', () => {
    assert.equal(getCodeTargetIdAfterClose(targets, 'missing'), null);
  });
});

describe('root code target helpers', () => {
  it('recognizes the implicit root target state', () => {
    assert.equal(getRootCodeTargetId('repo-1'), 'repo-1:root');
    assert.equal(isRootCodeTargetId('repo-1', null), true);
    assert.equal(isRootCodeTargetId('repo-1', 'repo-1:root'), true);
    assert.equal(isRootCodeTargetId('repo-1', 'session-1'), false);
  });
});
