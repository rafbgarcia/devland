import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  buildDetectedExternalEditorLaunchSpec,
  expandTargetPathArgument,
} from './external-editor';

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempPaths.splice(0).map((tempPath) => rm(tempPath, { recursive: true, force: true })),
  );
});

async function createTempAppBundle(structure: {
  appName: string;
  files: string[];
  bundleExecutable?: string;
}): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'devland-external-editor-'));
  tempPaths.push(tempRoot);

  const appPath = path.join(tempRoot, `${structure.appName}.app`);
  await mkdir(appPath, { recursive: true });

  if (structure.bundleExecutable) {
    const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
    await mkdir(path.dirname(infoPlistPath), { recursive: true });
    await writeFile(
      infoPlistPath,
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0">',
        '<dict>',
        '  <key>CFBundleExecutable</key>',
        `  <string>${structure.bundleExecutable}</string>`,
        '</dict>',
        '</plist>',
      ].join('\n'),
    );
  }

  await Promise.all(structure.files.map(async (relativePath) => {
    const filePath = path.join(appPath, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, '');
  }));

  return appPath;
}

describe('expandTargetPathArgument', () => {
  it('fills path, line, and column placeholders for custom editors', () => {
    assert.deepEqual(
      expandTargetPathArgument(
        ['--file', '%TARGET_PATH%', '--line', '%LINE%', '--column', '%COLUMN%'],
        {
          targetPath: '/tmp/example.ts',
          lineNumber: 18,
          columnNumber: 4,
        },
      ),
      ['--file', '/tmp/example.ts', '--line', '18', '--column', '4'],
    );
  });
});

describe('buildDetectedExternalEditorLaunchSpec', () => {
  it('uses bundled goto launchers for VS Code style editors', async () => {
    const editorPath = await createTempAppBundle({
      appName: 'Visual Studio Code',
      files: ['Contents/Resources/app/bin/code'],
    });

    const launchSpec = await buildDetectedExternalEditorLaunchSpec({
      editorId: 'com.microsoft.VSCode',
      editorPath,
      targetPath: '/tmp/example.ts',
      lineNumber: 42,
      columnNumber: 7,
    });

    assert.deepEqual(launchSpec, {
      executablePath: path.join(editorPath, 'Contents', 'Resources', 'app', 'bin', 'code'),
      args: ['--goto', '/tmp/example.ts:42:7'],
      spawnMode: 'direct',
    });
  });

  it('uses Zed cli path:line:column syntax', async () => {
    const editorPath = await createTempAppBundle({
      appName: 'Zed',
      files: ['Contents/MacOS/cli'],
    });

    const launchSpec = await buildDetectedExternalEditorLaunchSpec({
      editorId: 'dev.zed.Zed',
      editorPath,
      targetPath: '/tmp/example.ts',
      lineNumber: 9,
      columnNumber: null,
    });

    assert.deepEqual(launchSpec, {
      executablePath: path.join(editorPath, 'Contents', 'MacOS', 'cli'),
      args: ['/tmp/example.ts:9:1'],
      spawnMode: 'direct',
    });
  });

  it('uses xed for Xcode line targeting', async () => {
    const editorPath = await createTempAppBundle({
      appName: 'Xcode',
      files: ['Contents/Developer/usr/bin/xed'],
    });

    const launchSpec = await buildDetectedExternalEditorLaunchSpec({
      editorId: 'com.apple.dt.Xcode',
      editorPath,
      targetPath: '/tmp/example.ts',
      lineNumber: 12,
      columnNumber: null,
    });

    assert.deepEqual(launchSpec, {
      executablePath: path.join(editorPath, 'Contents', 'Developer', 'usr', 'bin', 'xed'),
      args: ['--line', '12', '/tmp/example.ts'],
      spawnMode: 'direct',
    });
  });

  it('uses JetBrains launchers with line and column arguments', async () => {
    const editorPath = await createTempAppBundle({
      appName: 'Android Studio',
      files: ['Contents/MacOS/studio'],
      bundleExecutable: 'studio',
    });

    const launchSpec = await buildDetectedExternalEditorLaunchSpec({
      editorId: 'com.google.android.studio',
      editorPath,
      targetPath: '/tmp/example.ts',
      lineNumber: 27,
      columnNumber: 3,
    });

    assert.deepEqual(launchSpec, {
      executablePath: path.join(editorPath, 'Contents', 'MacOS', 'studio'),
      args: ['--line', '27', '--column', '3', '/tmp/example.ts'],
      spawnMode: 'direct',
    });
  });

  it('falls back to plain file open for unsupported editors', async () => {
    const editorPath = await createTempAppBundle({
      appName: 'Nova',
      files: [],
    });

    const launchSpec = await buildDetectedExternalEditorLaunchSpec({
      editorId: 'com.panic.Nova',
      editorPath,
      targetPath: '/tmp/example.ts',
      lineNumber: 27,
      columnNumber: 3,
    });

    assert.deepEqual(launchSpec, {
      executablePath: editorPath,
      args: ['/tmp/example.ts'],
      spawnMode: 'darwin-open-files',
    });
  });
});
