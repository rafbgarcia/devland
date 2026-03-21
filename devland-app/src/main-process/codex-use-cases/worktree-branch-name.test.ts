import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { resolveSuggestedGitWorktreeBranchName } from './worktree-branch-name';

const execFileAsync = promisify(execFile);

async function execGit(cwd: string, args: string[]) {
  return execFileAsync('git', ['-C', cwd, ...args], {
    timeout: 15000,
    windowsHide: true,
  });
}

async function createCommittedRepo() {
  const repoPath = mkdtempSync(path.join(tmpdir(), 'devland-worktree-branch-test-'));

  await execGit(repoPath, ['init']);
  await execGit(repoPath, ['config', 'user.name', 'Devland Test']);
  await execGit(repoPath, ['config', 'user.email', 'devland@example.com']);
  writeFileSync(path.join(repoPath, 'tracked.txt'), 'tracked\n', 'utf8');
  await execGit(repoPath, ['add', 'tracked.txt']);
  await execGit(repoPath, ['commit', '-m', 'Initial commit']);
  await execGit(repoPath, ['branch', '-M', 'main']);

  return repoPath;
}

describe('resolveSuggestedGitWorktreeBranchName', () => {
  it('keeps a valid branch name suggestion', async () => {
    const repoPath = await createCommittedRepo();

    try {
      const result = await resolveSuggestedGitWorktreeBranchName(
        repoPath,
        'Add onboarding flow',
        async () => 'feature/onboarding-flow',
      );

      assert.equal(result.branch, 'feature/onboarding-flow');
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('falls back to a local slug when the suggestion is invalid or empty', async () => {
    const repoPath = await createCommittedRepo();

    try {
      const invalidResult = await resolveSuggestedGitWorktreeBranchName(
        repoPath,
        'Fix login modal',
        async () => '???',
      );
      const emptyResult = await resolveSuggestedGitWorktreeBranchName(
        repoPath,
        'Fix login modal',
        async () => '',
      );

      assert.equal(invalidResult.branch, 'fix-login-modal');
      assert.equal(emptyResult.branch, 'fix-login-modal');
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('deduplicates existing branch names with a numeric suffix that starts at 2', async () => {
    const repoPath = await createCommittedRepo();

    try {
      await execGit(repoPath, ['branch', 'fix-login-modal']);

      const result = await resolveSuggestedGitWorktreeBranchName(
        repoPath,
        'Fix login modal',
        async () => 'fix-login-modal',
      );

      assert.equal(result.branch, 'fix-login-modal-2');
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('strips the old codex prefix from returned branch names', async () => {
    const repoPath = await createCommittedRepo();

    try {
      const result = await resolveSuggestedGitWorktreeBranchName(
        repoPath,
        'Update onboarding',
        async () => 'codex/update-onboarding',
      );

      assert.equal(result.branch, 'update-onboarding');
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });
});
