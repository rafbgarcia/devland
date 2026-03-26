import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CodeTarget } from '@/ipc/contracts';
import type { CodexPromptSubmission } from '@/lib/codex-chat';

import {
  DETACHED_WORKTREE_TARGET_TITLE,
  getSessionNamingPromptText,
  getWorktreeTargetTitle,
  shouldBootstrapSessionNaming,
  shouldBootstrapDetachedWorktreeBranch,
} from './worktree-session';

const createTarget = (overrides: Partial<CodeTarget> = {}): CodeTarget => ({
  id: 'target-1',
  repoId: 'repo-1',
  kind: 'worktree',
  cwd: '/tmp/worktree',
  title: DETACHED_WORKTREE_TARGET_TITLE,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const createSubmission = (
  overrides: Partial<CodexPromptSubmission> = {},
): CodexPromptSubmission => ({
  prompt: 'Add onboarding flow',
  settings: {
    model: 'gpt-5.4',
    reasoningEffort: 'medium',
    runtimeMode: 'full-access',
    fastMode: false,
    interactionMode: 'default',
  },
  attachments: [],
  ...overrides,
});

describe('worktree session helpers', () => {
  it('derives prompt text from attachments when the prompt is empty', () => {
    assert.equal(
      getSessionNamingPromptText(createSubmission({
        prompt: '',
        attachments: [
          {
            type: 'image',
            id: 'attachment-1',
            name: 'error.png',
            mimeType: 'image/png',
            sizeBytes: 1,
            previewUrl: 'devland-codex-attachment://asset/ab/error.png',
          },
        ],
      })),
      'error.png',
    );
    assert.equal(getSessionNamingPromptText(createSubmission({ prompt: '' })), 'update');
  });

  it('maps detached HEAD to the detached worktree title', () => {
    assert.equal(getWorktreeTargetTitle('HEAD'), DETACHED_WORKTREE_TARGET_TITLE);
    assert.equal(getWorktreeTargetTitle('feature/onboarding'), 'feature/onboarding');
  });

  it('only bootstraps branch creation for detached worktrees without a branch name', () => {
    assert.equal(
      shouldBootstrapDetachedWorktreeBranch(createTarget()),
      true,
    );
    assert.equal(
      shouldBootstrapDetachedWorktreeBranch(createTarget({ title: 'feature/onboarding' })),
      false,
    );
  });

  it('bootstraps thread naming only before the first thread exists', () => {
    assert.equal(shouldBootstrapSessionNaming(null), true);
    assert.equal(shouldBootstrapSessionNaming('thread-1'), false);
  });
});
