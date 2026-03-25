import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  getRepoExtensions,
  parseRepoExtensionSource,
  selectInstallableExtensionVersions,
} from '@/main-process/extensions/repo-extensions';

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

describe('selectInstallableExtensionVersions', () => {
  it('returns only published stable releases with the matching uploaded asset', () => {
    const versions = selectInstallableExtensionVersions(
      [
        {
          tagName: 'v0.4.0',
          isDraft: false,
          isPrerelease: false,
          assets: [{ name: 'gh-prs.tgz', state: 'uploaded' }],
        },
        {
          tagName: 'v0.4.1',
          isDraft: true,
          isPrerelease: false,
          assets: [{ name: 'gh-prs.tgz', state: 'uploaded' }],
        },
        {
          tagName: 'v0.5.0-rc.1',
          isDraft: false,
          isPrerelease: true,
          assets: [{ name: 'gh-prs.tgz', state: 'uploaded' }],
        },
        {
          tagName: 'v0.4.2',
          isDraft: false,
          isPrerelease: false,
          assets: [{ name: 'gh-issues.tgz', state: 'uploaded' }],
        },
        {
          tagName: 'v0.4.3',
          isDraft: false,
          isPrerelease: false,
          assets: [{ name: 'gh-prs.tgz', state: 'new' }],
        },
      ],
      'gh-prs.tgz',
    );

    assert.deepEqual(versions, [{ tag: 'v0.4.0', label: '0.4.0' }]);
  });

  it('accepts assets without an explicit upload state', () => {
    const versions = selectInstallableExtensionVersions(
      [
        {
          tagName: 'v0.3.5',
          isDraft: false,
          isPrerelease: false,
          assets: [{ name: 'channels.tgz' }],
        },
      ],
      'channels.tgz',
    );

    assert.deepEqual(versions, [{ tag: 'v0.3.5', label: '0.3.5' }]);
  });
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
      installedReleaseVersion: null,
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

  it('treats a github extension as install-required when only a different release is installed', async () => {
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
    assert.equal(extensions[0]?.status, 'install-required');
    assert.equal(extensions[0]?.version, null);
    assert.equal(extensions[0]?.installedReleaseVersion, null);
    assert.equal(extensions[0]?.requestedVersion, '0.1.2');
    assert.equal(extensions[0]?.repositoryUrl, 'https://github.com/acme/devland-extensions');
    assert.equal(extensions[0]?.entryUrl, null);
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

    const installRoot = path.join(
      storageRoot,
      'acme',
      'devland-extensions',
      'gh-prs',
      'releases',
      encodeURIComponent('ext/gh-prs/0.1.0'),
    );
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
    assert.equal(extensions[0]?.installedReleaseVersion, 'ext/gh-prs/0.1.0');
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

    const installRoot = path.join(
      storageRoot,
      'acme',
      'devland',
      'gh-prs',
      'releases',
      encodeURIComponent('v0.1.0'),
    );
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
    assert.equal(extensions[0]?.installedReleaseVersion, 'v0.1.0');
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
        installedReleaseVersion: null,
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

  it('keeps different installed release roots available for different repos', async () => {
    const repoPathA = makeTempDir('devland-repo-extensions-versioned-a-');
    const repoPathB = makeTempDir('devland-repo-extensions-versioned-b-');
    const storageRoot = makeTempDir('devland-repo-extensions-storage-versioned-');
    process.env.DEVLAND_EXTENSION_STORAGE_DIR = storageRoot;

    writeJsonFile(repoPathA, 'devland.json', {
      extensions: [
        {
          source: 'github:acme/devland@v0.1.0#gh-prs.tgz',
          tabName: 'Pull requests',
          tabIcon: 'git-pull-request',
        },
      ],
    });
    writeJsonFile(repoPathB, 'devland.json', {
      extensions: [
        {
          source: 'github:acme/devland@v0.1.2#gh-prs.tgz',
          tabName: 'Pull requests',
          tabIcon: 'git-pull-request',
        },
      ],
    });

    const installRootA = path.join(
      storageRoot,
      'acme',
      'devland',
      'gh-prs',
      'releases',
      encodeURIComponent('v0.1.0'),
    );
    writeJsonFile(installRootA, 'installation.json', {
      source: parseRepoExtensionSource(repoPathA, {
        source: 'github:acme/devland@v0.1.0#gh-prs.tgz',
        tabName: 'Pull requests',
        tabIcon: 'git-pull-request',
      }),
      installedVersion: '0.1.0',
      installedReleaseVersion: 'v0.1.0',
      installedAt: Date.now(),
    });
    writeJsonFile(installRootA, 'package/devland.json', {
      id: 'gh-prs',
      name: 'GitHub Pull Requests',
      version: '0.1.0',
      entry: 'dist/index.html',
      commands: ['gh'],
    });
    writeTextFile(installRootA, 'package/dist/index.html', '<!doctype html><html></html>');

    const installRootB = path.join(
      storageRoot,
      'acme',
      'devland',
      'gh-prs',
      'releases',
      encodeURIComponent('v0.1.2'),
    );
    writeJsonFile(installRootB, 'installation.json', {
      source: parseRepoExtensionSource(repoPathB, {
        source: 'github:acme/devland@v0.1.2#gh-prs.tgz',
        tabName: 'Pull requests',
        tabIcon: 'git-pull-request',
      }),
      installedVersion: '0.1.2',
      installedReleaseVersion: 'v0.1.2',
      installedAt: Date.now(),
    });
    writeJsonFile(installRootB, 'package/devland.json', {
      id: 'gh-prs',
      name: 'GitHub Pull Requests',
      version: '0.1.2',
      entry: 'dist/index.html',
      commands: ['gh'],
    });
    writeTextFile(installRootB, 'package/dist/index.html', '<!doctype html><html></html>');

    const extensionsA = await getRepoExtensions(repoPathA);
    const extensionsB = await getRepoExtensions(repoPathB);

    assert.equal(extensionsA[0]?.status, 'ready');
    assert.equal(extensionsA[0]?.version, '0.1.0');
    assert.equal(extensionsA[0]?.installedReleaseVersion, 'v0.1.0');
    assert.equal(extensionsB[0]?.status, 'ready');
    assert.equal(extensionsB[0]?.version, '0.1.2');
    assert.equal(extensionsB[0]?.installedReleaseVersion, 'v0.1.2');
    assert.notEqual(extensionsA[0]?.installPath, extensionsB[0]?.installPath);
  });
});
