import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { getRepoExtensions, parseRepoExtensionSource } from '@/main-process/extensions/repo-extensions';

const tempDirs: string[] = [];
const originalStorageDir = process.env.DEVLAND_EXTENSION_STORAGE_DIR;

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

function writeTextFile(directoryPath: string, relativePath: string, contents = ''): void {
  const absolutePath = path.join(directoryPath, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents, 'utf8');
}

afterEach(() => {
  process.env.DEVLAND_EXTENSION_STORAGE_DIR = originalStorageDir;

  for (const directoryPath of tempDirs.splice(0, tempDirs.length)) {
    rmSync(directoryPath, { recursive: true, force: true });
  }
});

describe('getRepoExtensions', () => {
  it('resolves a local path extension with a dev server port', async () => {
    const repoPath = makeTempDir('devland-repo-extensions-repo-');
    const extensionPath = path.join(repoPath, 'extensions', 'gh-prs');

    writeJsonFile(repoPath, 'devland.json', {
      extensions: [
        {
          source: 'path:./extensions/gh-prs',
          tabName: 'Pull requests',
          tabIcon: 'git-pull-request',
          port: '4310',
        },
      ],
    });
    writeJsonFile(extensionPath, 'devland.json', {
      id: 'gh-prs',
      name: 'GitHub Pull Requests',
      version: '0.1.0',
      entry: 'dist/index.html',
      commands: ['gh'],
    });

    const extensions = await getRepoExtensions(repoPath);

    assert.equal(extensions.length, 1);
    assert.deepEqual(extensions[0], {
      id: 'gh-prs',
      tabName: 'Pull requests',
      tabIcon: 'git-pull-request',
      status: 'ready',
      name: 'GitHub Pull Requests',
      version: '0.1.0',
      requestedVersion: '0.1.0',
      commands: ['gh'],
      entryUrl: 'http://127.0.0.1:4310/',
      installPath: extensionPath,
      repositoryUrl: null,
      source: {
        kind: 'path',
        raw: 'path:./extensions/gh-prs',
        extensionPath,
        port: 4310,
        extensionKey: 'gh-prs',
      },
      error: null,
    });
  });

  it('ignores root devland.json files that are extension manifests instead of repo config', async () => {
    const repoPath = makeTempDir('devland-repo-extensions-manifest-');

    writeJsonFile(repoPath, 'devland.json', {
      id: 'gh-prs',
      name: 'GitHub Pull Requests',
      version: '0.1.0',
      entry: 'dist/index.html',
      commands: ['gh'],
    });

    const extensions = await getRepoExtensions(repoPath);

    assert.deepEqual(extensions, []);
  });

  it('marks a github extension as update-available when the installed copy is older than repo config', async () => {
    const repoPath = makeTempDir('devland-repo-extensions-github-');
    const storageRoot = makeTempDir('devland-repo-extensions-storage-');
    process.env.DEVLAND_EXTENSION_STORAGE_DIR = storageRoot;

    writeJsonFile(repoPath, 'devland.json', {
      extensions: [
        {
          source: 'github:acme/devland-extensions@0.1.2#gh-prs.tgz',
          tabName: 'Pull requests',
          tabIcon: 'git-pull-request',
        },
      ],
    });

    const source = parseRepoExtensionSource(repoPath, {
      source: 'github:acme/devland-extensions@0.1.2#gh-prs.tgz',
      tabName: 'Pull requests',
      tabIcon: 'git-pull-request',
    });

    assert.equal(source.kind, 'github');

    const installRoot = path.join(storageRoot, 'acme', 'devland-extensions', 'gh-prs');
    writeJsonFile(installRoot, 'installation.json', {
      source,
      installedVersion: '0.1.1',
      installedAt: Date.now(),
    });
    writeJsonFile(installRoot, 'package/devland.json', {
      id: 'gh-prs',
      name: 'GitHub Pull Requests',
      version: '0.1.1',
      entry: 'dist/index.html',
      commands: ['gh'],
    });
    writeTextFile(installRoot, 'package/dist/index.html', '<!doctype html><html></html>');

    const extensions = await getRepoExtensions(repoPath);

    assert.equal(extensions.length, 1);
    assert.equal(extensions[0]?.status, 'update-available');
    assert.equal(extensions[0]?.version, '0.1.1');
    assert.equal(extensions[0]?.requestedVersion, '0.1.2');
    assert.equal(extensions[0]?.repositoryUrl, 'https://github.com/acme/devland-extensions');
    assert.ok(extensions[0]?.entryUrl?.startsWith('file://'));
  });
});
