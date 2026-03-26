import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  buildFallbackCodexThreadName,
  normalizeCodexThreadNameCandidate,
  resolveSuggestedCodexSessionNaming,
} from './session-naming';

const execFileAsync = promisify(execFile);

async function execGit(cwd: string, args: string[]) {
  return execFileAsync('git', ['-C', cwd, ...args], {
    timeout: 15000,
    windowsHide: true,
  });
}

async function createCommittedRepo() {
  const repoPath = mkdtempSync(path.join(tmpdir(), 'devland-session-naming-test-'));

  await execGit(repoPath, ['init']);
  await execGit(repoPath, ['config', 'user.name', 'Devland Test']);
  await execGit(repoPath, ['config', 'user.email', 'devland@example.com']);
  writeFileSync(path.join(repoPath, 'tracked.txt'), 'tracked\n', 'utf8');
  await execGit(repoPath, ['add', 'tracked.txt']);
  await execGit(repoPath, ['commit', '-m', 'Initial commit']);
  await execGit(repoPath, ['branch', '-M', 'main']);

  return repoPath;
}

describe('session naming helpers', () => {
  it('normalizes generated thread names to a single line of text', () => {
    assert.equal(
      normalizeCodexThreadNameCandidate('  "Investigate branch naming"\n\nextra detail'),
      'Investigate branch naming',
    );
  });

  it('builds a fallback thread name from the prompt text', () => {
    assert.equal(buildFallbackCodexThreadName('  Fix login modal  '), 'Fix login modal');
    assert.equal(buildFallbackCodexThreadName('   '), 'Update');
  });
});

describe('resolveSuggestedCodexSessionNaming', () => {
  it('keeps a valid thread name suggestion and derives the branch slug from it', async () => {
    const repoPath = await createCommittedRepo();

    try {
      const result = await resolveSuggestedCodexSessionNaming(
        repoPath,
        'Add onboarding flow',
        async () => 'Investigate onboarding flow',
      );

      assert.deepEqual(result, {
        threadName: 'Investigate onboarding flow',
        branchName: 'investigate-onboarding-flow',
      });
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('falls back to prompt text when the suggestion is invalid or empty', async () => {
    const repoPath = await createCommittedRepo();

    try {
      const invalidResult = await resolveSuggestedCodexSessionNaming(
        repoPath,
        'Fix login modal',
        async () => '   ',
      );

      assert.deepEqual(invalidResult, {
        threadName: 'Fix login modal',
        branchName: 'fix-login-modal',
      });
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('deduplicates derived branch names with a numeric suffix that starts at 2', async () => {
    const repoPath = await createCommittedRepo();

    try {
      await execGit(repoPath, ['branch', 'fix-login-modal']);

      const result = await resolveSuggestedCodexSessionNaming(
        repoPath,
        'Fix login modal',
        async () => 'Fix login modal',
      );

      assert.deepEqual(result, {
        threadName: 'Fix login modal',
        branchName: 'fix-login-modal-2',
      });
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });
});
