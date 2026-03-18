import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import os from 'node:os';
import path from 'node:path';

import {
  clearCodexPathSearchCache,
  searchCodexPaths,
} from '@/main-process/codex-path-search';

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const directoryPath = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(directoryPath);
  return directoryPath;
}

function writeFile(repoPath: string, relativePath: string, contents = ''): void {
  const absolutePath = path.join(repoPath, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents, 'utf8');
}

function runGit(repoPath: string, args: string[]): void {
  const result = spawnSync('git', ['-C', repoPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  }
}

afterEach(() => {
  clearCodexPathSearchCache();

  for (const directoryPath of tempDirs.splice(0, tempDirs.length)) {
    rmSync(directoryPath, { recursive: true, force: true });
  }
});

describe('searchCodexPaths', () => {
  it('searches the current repo using repo-relative paths', async () => {
    const repoPath = makeTempDir('devland-codex-path-current-');
    runGit(repoPath, ['init']);
    writeFile(repoPath, 'src/components/chat-composer.tsx', 'export {};');

    const result = await searchCodexPaths({
      cwd: repoPath,
      scope: 'current',
      query: 'chat',
      limit: 20,
      storedRepoPaths: [],
    });

    assert.deepEqual(result.items, [
      {
        scope: 'current',
        repoPath,
        repoLabel: path.basename(repoPath),
        relativePath: 'src/components/chat-composer.tsx',
        absolutePath: path.join(repoPath, 'src/components/chat-composer.tsx'),
      },
    ]);
    assert.equal(result.truncated, false);
  });

  it('searches across stored local repos and ignores missing entries', async () => {
    const currentRepoPath = makeTempDir('devland-codex-path-root-');
    runGit(currentRepoPath, ['init']);
    writeFile(currentRepoPath, 'src/current.ts', 'export {};');

    const otherRepoPath = makeTempDir('devland-codex-path-other-');
    runGit(otherRepoPath, ['init']);
    writeFile(otherRepoPath, 'packages/api/src/server.ts', 'export {};');

    const missingRepoPath = path.join(os.tmpdir(), 'devland-codex-missing-repo');

    const result = await searchCodexPaths({
      cwd: currentRepoPath,
      scope: 'global',
      query: 'server',
      limit: 20,
      storedRepoPaths: [currentRepoPath, otherRepoPath, missingRepoPath],
    });

    assert.deepEqual(result.items, [
      {
        scope: 'global',
        repoPath: otherRepoPath,
        repoLabel: path.basename(otherRepoPath),
        relativePath: 'packages/api/src/server.ts',
        absolutePath: path.join(otherRepoPath, 'packages/api/src/server.ts'),
      },
    ]);
    assert.equal(result.truncated, false);
  });

  it('lets global searches scope by repo label and filename together', async () => {
    const currentRepoPath = makeTempDir('devland-codex-path-current-global-');
    runGit(currentRepoPath, ['init']);
    writeFile(currentRepoPath, 'src/chat-composer.tsx', 'export {};');

    const parentDirectory = makeTempDir('devland-codex-path-scoped-parent-');
    const otherRepoPath = path.join(parentDirectory, 't3code');
    mkdirSync(otherRepoPath, { recursive: true });
    runGit(otherRepoPath, ['init']);
    writeFile(otherRepoPath, 'packages/chat/src/chat-composer.tsx', 'export {};');

    const result = await searchCodexPaths({
      cwd: currentRepoPath,
      scope: 'global',
      query: 't3codechatcomposer',
      limit: 20,
      storedRepoPaths: [currentRepoPath, otherRepoPath],
    });

    assert.deepEqual(result.items[0], {
      scope: 'global',
      repoPath: otherRepoPath,
      repoLabel: 't3code',
      relativePath: 'packages/chat/src/chat-composer.tsx',
      absolutePath: path.join(otherRepoPath, 'packages/chat/src/chat-composer.tsx'),
    });
  });
});
