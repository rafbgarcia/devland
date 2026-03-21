import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { readRepoConfig } from '@/main-process/repo-config';

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const directoryPath = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(directoryPath);
  return directoryPath;
}

function writeJsonFile(directoryPath: string, relativePath: string, value: unknown): void {
  const absolutePath = path.join(directoryPath, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, JSON.stringify(value, null, 2), 'utf8');
}

afterEach(() => {
  for (const directoryPath of tempDirs.splice(0, tempDirs.length)) {
    rmSync(directoryPath, { recursive: true, force: true });
  }
});

describe('readRepoConfig', () => {
  it('returns defaults when devland.json is missing', async () => {
    const repoPath = makeTempDir('devland-repo-config-missing-');

    const config = await readRepoConfig(repoPath);

    assert.deepEqual(config, {
      extensions: [],
    });
  });

  it('reads and trims worktreeSetupCommand from devland.json', async () => {
    const repoPath = makeTempDir('devland-repo-config-command-');

    writeJsonFile(repoPath, 'devland.json', {
      worktreeSetupCommand: '  bun run setup-worktree  ',
    });

    const config = await readRepoConfig(repoPath);

    assert.deepEqual(config, {
      extensions: [],
      worktreeSetupCommand: 'bun run setup-worktree',
    });
  });

  it('reads and trims suggestedPrompts from devland.json', async () => {
    const repoPath = makeTempDir('devland-repo-config-prompts-');

    writeJsonFile(repoPath, 'devland.json', {
      suggestedPrompts: [
        {
          label: '  Review branch  ',
          prompt: '  Code review the current branch.  ',
        },
      ],
    });

    const config = await readRepoConfig(repoPath);

    assert.deepEqual(config, {
      extensions: [],
      suggestedPrompts: [
        {
          label: 'Review branch',
          prompt: 'Code review the current branch.',
        },
      ],
    });
  });

  it('preserves an explicit empty suggestedPrompts list', async () => {
    const repoPath = makeTempDir('devland-repo-config-empty-prompts-');

    writeJsonFile(repoPath, 'devland.json', {
      suggestedPrompts: [],
    });

    const config = await readRepoConfig(repoPath);

    assert.deepEqual(config, {
      extensions: [],
      suggestedPrompts: [],
    });
  });
});
