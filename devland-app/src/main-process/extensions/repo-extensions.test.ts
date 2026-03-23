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
        relativePath: './extensions/gh-prs',
        extensionPath,
        port: 4310,
        extensionKey: 'gh-prs',
        requiresClone: false,
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
    assert.ok(extensions[0]?.entryUrl?.startsWith('devland-extension://'));
  });

  it('treats a tagged release like ext/gh-prs/0.1.0 as current when the installed manifest version matches', async () => {
    const repoPath = makeTempDir('devland-repo-extensions-github-tagged-');
    const storageRoot = makeTempDir('devland-repo-extensions-storage-tagged-');
    process.env.DEVLAND_EXTENSION_STORAGE_DIR = storageRoot;

    writeJsonFile(repoPath, 'devland.json', {
      extensions: [
        {
          source: 'github:acme/devland-extensions@ext/gh-prs/0.1.0#gh-prs.tgz',
          tabName: 'Pull requests',
          tabIcon: 'git-pull-request',
        },
      ],
    });

    const source = parseRepoExtensionSource(repoPath, {
      source: 'github:acme/devland-extensions@ext/gh-prs/0.1.0#gh-prs.tgz',
      tabName: 'Pull requests',
      tabIcon: 'git-pull-request',
    });

    assert.equal(source.kind, 'github');

    const installRoot = path.join(storageRoot, 'acme', 'devland-extensions', 'gh-prs');
    writeJsonFile(installRoot, 'installation.json', {
      source,
      installedVersion: '0.1.0',
      installedAt: Date.now(),
    });
    writeJsonFile(installRoot, 'package/devland.json', {
      id: 'gh-prs',
      name: 'GitHub Pull Requests',
      version: '0.1.0',
      entry: 'dist/index.html',
      commands: ['gh'],
    });
    writeTextFile(installRoot, 'package/dist/index.html', '<!doctype html><html></html>');

    const extensions = await getRepoExtensions(repoPath);

    assert.equal(extensions.length, 1);
    assert.equal(extensions[0]?.status, 'ready');
    assert.equal(extensions[0]?.version, '0.1.0');
    assert.equal(extensions[0]?.requestedVersion, '0.1.0');
    assert.ok(extensions[0]?.entryUrl?.startsWith('devland-extension://'));
  });

  it('treats a shared release tag like v0.1.0 as current for legacy installs without release metadata', async () => {
    const repoPath = makeTempDir('devland-repo-extensions-github-shared-tagged-');
    const storageRoot = makeTempDir('devland-repo-extensions-storage-shared-tagged-');
    process.env.DEVLAND_EXTENSION_STORAGE_DIR = storageRoot;

    writeJsonFile(repoPath, 'devland.json', {
      extensions: [
        {
          source: 'github:acme/devland@v0.1.0#gh-prs.tgz',
          tabName: 'Pull requests',
          tabIcon: 'git-pull-request',
        },
      ],
    });

    const source = parseRepoExtensionSource(repoPath, {
      source: 'github:acme/devland@v0.1.0#gh-prs.tgz',
      tabName: 'Pull requests',
      tabIcon: 'git-pull-request',
    });

    assert.equal(source.kind, 'github');

    const installRoot = path.join(storageRoot, 'acme', 'devland', 'gh-prs');
    writeJsonFile(installRoot, 'installation.json', {
      source,
      installedVersion: '0.1.0',
      installedAt: Date.now(),
    });
    writeJsonFile(installRoot, 'package/devland.json', {
      id: 'gh-prs',
      name: 'GitHub Pull Requests',
      version: '0.1.0',
      entry: 'dist/index.html',
      commands: ['gh'],
    });
    writeTextFile(installRoot, 'package/dist/index.html', '<!doctype html><html></html>');

    const extensions = await getRepoExtensions(repoPath);

    assert.equal(extensions.length, 1);
    assert.equal(extensions[0]?.status, 'ready');
    assert.equal(extensions[0]?.version, '0.1.0');
    assert.equal(extensions[0]?.requestedVersion, '0.1.0');
    assert.equal(extensions[0]?.repositoryUrl, 'https://github.com/acme/devland');
    assert.ok(extensions[0]?.entryUrl?.startsWith('devland-extension://'));
  });

  it('marks remote path-backed extensions as clone-required', async () => {
    const extensions = await getRepoExtensions('acme/remote-app', {
      readRepoConfig: async () => ({
        extensions: [
          {
            source: 'path:./extensions/channels',
            tabName: 'Channels',
            tabIcon: 'message-circle',
          },
        ],
      }),
    });

    assert.deepEqual(extensions, [
      {
        id: 'channels',
        tabName: 'Channels',
        tabIcon: 'message-circle',
        status: 'clone-required',
        name: null,
        version: null,
        requestedVersion: null,
        commands: [],
        entryUrl: null,
        installPath: null,
        repositoryUrl: null,
        source: {
          kind: 'path',
          raw: 'path:./extensions/channels',
          relativePath: './extensions/channels',
          extensionPath: null,
          port: null,
          extensionKey: 'channels',
          requiresClone: true,
        },
        error: null,
      },
    ]);
  });
});
