import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CodeTarget } from '@/ipc/contracts';
import type { CodexPromptSubmission } from '@/lib/codex-chat';

import {
  DETACHED_WORKTREE_TARGET_TITLE,
  getWorktreePromptText,
  getWorktreeTargetTitle,
  sendPromptWithDetachedWorktreeBootstrap,
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
  },
  attachments: [],
  ...overrides,
});

describe('worktree session helpers', () => {
  it('derives prompt text from attachments when the prompt is empty', () => {
    assert.equal(
      getWorktreePromptText(createSubmission({
        prompt: '',
        attachments: [
          {
            type: 'image',
            name: 'error.png',
            mimeType: 'image/png',
            sizeBytes: 1,
            dataUrl: 'data:image/png;base64,AA==',
          },
        ],
      })),
      'error.png',
    );
    assert.equal(getWorktreePromptText(createSubmission({ prompt: '' })), 'update');
  });

  it('maps detached HEAD to the detached worktree title', () => {
    assert.equal(getWorktreeTargetTitle('HEAD'), DETACHED_WORKTREE_TARGET_TITLE);
    assert.equal(getWorktreeTargetTitle('feature/onboarding'), 'feature/onboarding');
  });

  it('only bootstraps branch creation for the first detached worktree prompt', () => {
    assert.equal(
      shouldBootstrapDetachedWorktreeBranch(createTarget(), 0),
      true,
    );
    assert.equal(
      shouldBootstrapDetachedWorktreeBranch(createTarget({ title: 'feature/onboarding' }), 0),
      false,
    );
    assert.equal(
      shouldBootstrapDetachedWorktreeBranch(createTarget(), 1),
      false,
    );
  });

  it('bootstraps the detached worktree branch before sending the prompt', async () => {
    const events: string[] = [];

    await sendPromptWithDetachedWorktreeBootstrap({
      target: createTarget(),
      sessionMessageCount: 0,
      submission: createSubmission(),
      bootstrapDetachedWorktreeBranch: async () => {
        events.push('bootstrap');
      },
      sendPrompt: async () => {
        events.push('send');
      },
    });

    assert.deepEqual(events, ['bootstrap', 'send']);
  });

  it('skips branch bootstrap once the worktree already has a branch name', async () => {
    const events: string[] = [];

    await sendPromptWithDetachedWorktreeBootstrap({
      target: createTarget({ title: 'feature/onboarding' }),
      sessionMessageCount: 0,
      submission: createSubmission(),
      bootstrapDetachedWorktreeBranch: async () => {
        events.push('bootstrap');
      },
      sendPrompt: async () => {
        events.push('send');
      },
    });

    assert.deepEqual(events, ['send']);
  });
});
