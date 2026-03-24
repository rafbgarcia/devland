#!/usr/bin/env bun

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compareSemver,
  extractSdkVersionFromTag,
  normalizeVersionInput,
  parseSemver,
} from './release-utils';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sdkPackageRelativePath = 'packages/devland-sdk/package.json';

const readJsonFile = (relativePath: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<string, unknown>;

const writeJsonFile = (relativePath: string, value: Record<string, unknown>): void => {
  const filePath = path.join(repoRoot, relativePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const runGit = async (args: string[]): Promise<string> => {
  const processHandle = Bun.spawn({
    cmd: ['git', ...args],
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
    processHandle.exited,
  ]);

  if (exitCode !== 0) {
    const details = stderr.trim() || stdout.trim() || `git ${args.join(' ')}`;
    throw new Error(details);
  }

  return stdout;
};

const resolveLatestReleasedVersion = async (): Promise<string | null> => {
  const localTagOutput = await runGit(['tag', '--list', 'sdk/v*']);
  const remoteTagOutput = await runGit(['ls-remote', '--tags', '--refs', 'origin', 'sdk/v*']);
  const candidateVersions = new Set<string>();

  for (const tag of localTagOutput.split('\n').map((line) => line.trim()).filter(Boolean)) {
    const version = extractSdkVersionFromTag(tag);

    if (version !== null) {
      candidateVersions.add(version);
    }
  }

  for (const line of remoteTagOutput.split('\n').map((entry) => entry.trim()).filter(Boolean)) {
    const [, ref] = line.split('\t');

    if (!ref) {
      continue;
    }

    const tag = ref.replace(/^refs\/tags\//, '');
    const version = extractSdkVersionFromTag(tag);

    if (version !== null) {
      candidateVersions.add(version);
    }
  }

  return [...candidateVersions].sort(compareSemver).at(-1) ?? null;
};

const ensureCleanWorktree = async (): Promise<void> => {
  const statusOutput = await runGit(['status', '--short']);

  if (statusOutput.trim().length > 0) {
    throw new Error(
      'Refusing to release from a dirty worktree. Commit, stash, or discard existing changes first.',
    );
  }
};

const validateReleaseVersion = async (version: string): Promise<void> => {
  parseSemver(version);

  const latestVersion = await resolveLatestReleasedVersion();

  if (latestVersion !== null && compareSemver(version, latestVersion) <= 0) {
    throw new Error(
      `Version ${version} must be greater than the latest SDK tag version ${latestVersion}.`,
    );
  }

  const targetTag = `sdk/v${version}`;
  const localTags = await runGit(['tag', '--list', targetTag]);

  if (localTags.split('\n').map((line) => line.trim()).includes(targetTag)) {
    throw new Error(`Local tag ${targetTag} already exists.`);
  }

  const remoteTags = await runGit(['ls-remote', '--tags', '--refs', 'origin', targetTag]);

  if (remoteTags.trim().length > 0) {
    throw new Error(`Remote tag ${targetTag} already exists on origin.`);
  }
};

const updateSdkVersion = (version: string): string | null => {
  const packageJson = readJsonFile(sdkPackageRelativePath);

  if (typeof packageJson.version !== 'string') {
    throw new Error(`SDK package at ${sdkPackageRelativePath} does not contain a string version.`);
  }

  if (packageJson.version === version) {
    return null;
  }

  packageJson.version = version;
  writeJsonFile(sdkPackageRelativePath, packageJson);

  return sdkPackageRelativePath;
};

const main = async (): Promise<void> => {
  const rawVersion = process.argv[2];

  if (!rawVersion) {
    throw new Error('Usage: bun run scripts/release-sdk.ts <version>');
  }

  const version = normalizeVersionInput(rawVersion);
  const releaseTag = `sdk/v${version}`;

  await ensureCleanWorktree();
  await validateReleaseVersion(version);

  const updatedPath = updateSdkVersion(version);
  if (updatedPath === null) {
    throw new Error(`SDK package version is already ${version}.`);
  }

  await Bun.$`node ${path.join(repoRoot, 'scripts/validate-sdk-release.mjs')} ${releaseTag}`;
  await runGit(['add', '--', updatedPath]);
  await runGit(['commit', '-m', `chore: release ${releaseTag}`]);
  await runGit(['tag', releaseTag]);
  await runGit(['push', 'origin', 'HEAD', `refs/tags/${releaseTag}`]);

  console.log(`Released ${releaseTag}.`);
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
