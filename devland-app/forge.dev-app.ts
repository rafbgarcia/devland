import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { PluginBase } from '@electron-forge/plugin-base';
import type { ResolvedForgeConfig, StartResult } from '@electron-forge/shared-types';

type DevAppLauncherPluginConfig = {
  displayName: string;
  bundleId: string;
  iconPath: string;
  runtimeDir?: string;
};

type LauncherMetadata = {
  launcherVersion: number;
  bundleId: string;
  displayName: string;
  iconMtimeMs: number;
  sourceAppBundlePath: string;
  sourceAppBundleMtimeMs: number;
  preservesSymlinks: boolean;
};

const LAUNCHER_VERSION = 2;

const setPlistString = (plistPath: string, key: string, value: string): void => {
  const replaceResult = spawnSync('plutil', ['-replace', key, '-string', value, plistPath], {
    encoding: 'utf8',
  });

  if (replaceResult.status === 0) {
    return;
  }

  const insertResult = spawnSync('plutil', ['-insert', key, '-string', value, plistPath], {
    encoding: 'utf8',
  });

  if (insertResult.status === 0) {
    return;
  }

  const details = [replaceResult.stderr, insertResult.stderr].filter(Boolean).join('\n');
  throw new Error(`Failed to update plist key "${key}" at ${plistPath}: ${details}`.trim());
};

const patchMainBundleInfoPlist = (
  appBundlePath: string,
  config: DevAppLauncherPluginConfig,
): void => {
  const infoPlistPath = path.join(appBundlePath, 'Contents', 'Info.plist');
  const iconFileName = path.basename(config.iconPath);
  const resourcesDir = path.join(appBundlePath, 'Contents', 'Resources');

  setPlistString(infoPlistPath, 'CFBundleDisplayName', config.displayName);
  setPlistString(infoPlistPath, 'CFBundleName', config.displayName);
  setPlistString(infoPlistPath, 'CFBundleIdentifier', config.bundleId);
  setPlistString(infoPlistPath, 'CFBundleIconFile', iconFileName);

  copyFileSync(config.iconPath, path.join(resourcesDir, iconFileName));
  copyFileSync(config.iconPath, path.join(resourcesDir, 'electron.icns'));
};

const patchHelperBundleInfoPlists = (
  appBundlePath: string,
  config: DevAppLauncherPluginConfig,
): void => {
  const frameworksDir = path.join(appBundlePath, 'Contents', 'Frameworks');

  if (!existsSync(frameworksDir)) {
    return;
  }

  for (const entry of readdirSync(frameworksDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith('.app')) {
      continue;
    }

    if (!entry.name.startsWith('Electron Helper')) {
      continue;
    }

    const helperPlistPath = path.join(frameworksDir, entry.name, 'Contents', 'Info.plist');

    if (!existsSync(helperPlistPath)) {
      continue;
    }

    const suffix = entry.name.replace('Electron Helper', '').replace('.app', '').trim();
    const helperName = suffix
      ? `${config.displayName} Helper ${suffix}`
      : `${config.displayName} Helper`;
    const helperIdSuffix = suffix.replace(/[()]/g, '').trim().toLowerCase().replace(/\s+/g, '-');
    const helperBundleId = helperIdSuffix
      ? `${config.bundleId}.helper.${helperIdSuffix}`
      : `${config.bundleId}.helper`;

    setPlistString(helperPlistPath, 'CFBundleDisplayName', helperName);
    setPlistString(helperPlistPath, 'CFBundleName', helperName);
    setPlistString(helperPlistPath, 'CFBundleIdentifier', helperBundleId);
  }
};

const readJson = <T>(filePath: string): T | null => {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
};

export const resolveDevElectronExecutable = (
  projectDir: string,
  config: DevAppLauncherPluginConfig,
): string | null => {
  if (process.platform !== 'darwin') {
    return null;
  }

  const require = createRequire(__filename);
  const electronBinaryPath = require('electron') as string;
  const sourceAppBundlePath = path.resolve(electronBinaryPath, '../../..');
  const runtimeDir = path.resolve(projectDir, config.runtimeDir ?? '.electron-runtime');
  const targetAppBundlePath = path.join(runtimeDir, `${config.displayName}.app`);
  const targetBinaryPath = path.join(targetAppBundlePath, 'Contents', 'MacOS', 'Electron');
  const metadataPath = path.join(runtimeDir, 'metadata.json');
  const expectedMetadata: LauncherMetadata = {
    launcherVersion: LAUNCHER_VERSION,
    bundleId: config.bundleId,
    displayName: config.displayName,
    iconMtimeMs: statSync(config.iconPath).mtimeMs,
    sourceAppBundlePath,
    sourceAppBundleMtimeMs: statSync(sourceAppBundlePath).mtimeMs,
    preservesSymlinks: true,
  };
  const currentMetadata = readJson<LauncherMetadata>(metadataPath);

  mkdirSync(runtimeDir, { recursive: true });

  if (
    existsSync(targetBinaryPath) &&
    currentMetadata !== null &&
    JSON.stringify(currentMetadata) === JSON.stringify(expectedMetadata)
  ) {
    return targetBinaryPath;
  }

  rmSync(targetAppBundlePath, { recursive: true, force: true });
  cpSync(sourceAppBundlePath, targetAppBundlePath, {
    recursive: true,
    verbatimSymlinks: true,
  });
  patchMainBundleInfoPlist(targetAppBundlePath, config);
  patchHelperBundleInfoPlists(targetAppBundlePath, config);
  writeFileSync(metadataPath, `${JSON.stringify(expectedMetadata, null, 2)}\n`);

  return targetBinaryPath;
};

export class DevAppLauncherPlugin extends PluginBase<DevAppLauncherPluginConfig> {
  override name = 'dev-app-launcher';

  private projectDir = process.cwd();

  override init(dir: string, config: ResolvedForgeConfig): void {
    this.projectDir = dir;
    super.init(dir, config);
  }

  override async startLogic(): Promise<StartResult> {
    return resolveDevElectronExecutable(this.projectDir, this.config) ?? false;
  }
}
