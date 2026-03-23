#!/usr/bin/env bun

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

type Semver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  raw: string;
};

type ReleaseVersionTarget = {
  label: string;
  relativePath: string;
};

const VERSION_PATTERN =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z.-]+))?(?:\+(?<build>[0-9A-Za-z.-]+))?$/;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const parseSemver = (value: string): Semver => {
  const match = value.trim().match(VERSION_PATTERN);

  if (
    !match?.groups?.major ||
    !match.groups.minor ||
    !match.groups.patch
  ) {
    throw new Error(
      `Version "${value}" must use semver like 0.1.2 or 0.1.2-beta.1.`,
    );
  }

  return {
    major: Number.parseInt(match.groups.major, 10),
    minor: Number.parseInt(match.groups.minor, 10),
    patch: Number.parseInt(match.groups.patch, 10),
    prerelease: match.groups.prerelease?.split('.').filter(Boolean) ?? [],
    raw: `${match.groups.major}.${match.groups.minor}.${match.groups.patch}${match.groups.prerelease ? `-${match.groups.prerelease}` : ''}`,
  };
};

const comparePrereleaseIdentifiers = (left: string, right: string): number => {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) {
    return Number.parseInt(left, 10) - Number.parseInt(right, 10);
  }

  if (leftNumeric) {
    return -1;
  }

  if (rightNumeric) {
    return 1;
  }

  return left.localeCompare(right);
};

export const compareSemver = (left: string, right: string): number => {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);

  if (leftVersion.major !== rightVersion.major) {
    return leftVersion.major - rightVersion.major;
  }

  if (leftVersion.minor !== rightVersion.minor) {
    return leftVersion.minor - rightVersion.minor;
  }

  if (leftVersion.patch !== rightVersion.patch) {
    return leftVersion.patch - rightVersion.patch;
  }

  if (leftVersion.prerelease.length === 0 && rightVersion.prerelease.length === 0) {
    return 0;
  }

  if (leftVersion.prerelease.length === 0) {
    return 1;
  }

  if (rightVersion.prerelease.length === 0) {
    return -1;
  }

  const sharedLength = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];

    if (leftIdentifier === undefined) {
      return -1;
    }

    if (rightIdentifier === undefined) {
      return 1;
    }

    const comparison = comparePrereleaseIdentifiers(leftIdentifier, rightIdentifier);

    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
};

export const extractVersionFromTag = (tag: string): string | null => {
  const normalizedTag = tag.trim();
  const sharedTagMatch = normalizedTag.match(/^v(?<version>.+)$/);

  if (sharedTagMatch?.groups?.version) {
    try {
      parseSemver(sharedTagMatch.groups.version);
      return sharedTagMatch.groups.version;
    } catch {
      return null;
    }
  }

  const legacyExtensionTagMatch = normalizedTag.match(/^ext\/[^/]+\/(?<version>.+)$/);

  if (legacyExtensionTagMatch?.groups?.version) {
    try {
      parseSemver(legacyExtensionTagMatch.groups.version);
      return legacyExtensionTagMatch.groups.version;
    } catch {
      return null;
    }
  }

  return null;
};

const listManagedVersionTargets = (): ReleaseVersionTarget[] => {
  const extensionDirectories = fs
    .readdirSync(path.join(repoRoot, 'extensions'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const targets: ReleaseVersionTarget[] = [
    {
      label: 'devland-app package',
      relativePath: 'devland-app/package.json',
    },
  ];

  for (const extensionDirectory of extensionDirectories) {
    targets.push(
      {
        label: `${extensionDirectory} package`,
        relativePath: `extensions/${extensionDirectory}/package.json`,
      },
      {
        label: `${extensionDirectory} manifest`,
        relativePath: `extensions/${extensionDirectory}/devland.json`,
      },
    );
  }

  return targets;
};

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
  const localTagOutput = await runGit(['tag', '--list']);
  const remoteTagOutput = await runGit(['ls-remote', '--tags', '--refs', 'origin']);
  const candidateVersions = new Set<string>();

  for (const tag of localTagOutput.split('\n').map((line) => line.trim()).filter(Boolean)) {
    const version = extractVersionFromTag(tag);

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
    const version = extractVersionFromTag(tag);

    if (version !== null) {
      candidateVersions.add(version);
    }
  }

  return [...candidateVersions].sort(compareSemver).at(-1) ?? null;
};

const normalizeVersionInput = (value: string): string => value.trim().replace(/^v(?=\d)/i, '');

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
      `Version ${version} must be greater than the latest released tag version ${latestVersion}.`,
    );
  }

  const targetTag = `v${version}`;
  const localTags = await runGit(['tag', '--list', targetTag]);

  if (localTags.split('\n').map((line) => line.trim()).includes(targetTag)) {
    throw new Error(`Local tag ${targetTag} already exists.`);
  }

  const remoteTags = await runGit(['ls-remote', '--tags', '--refs', 'origin', targetTag]);

  if (remoteTags.trim().length > 0) {
    throw new Error(`Remote tag ${targetTag} already exists on origin.`);
  }
};

const updateManagedVersions = (version: string): string[] => {
  const updatedPaths: string[] = [];

  for (const target of listManagedVersionTargets()) {
    const jsonValue = readJsonFile(target.relativePath);

    if (typeof jsonValue.version !== 'string') {
      throw new Error(`${target.label} at ${target.relativePath} does not contain a string version.`);
    }

    if (jsonValue.version === version) {
      continue;
    }

    jsonValue.version = version;
    writeJsonFile(target.relativePath, jsonValue);
    updatedPaths.push(target.relativePath);
  }

  return updatedPaths;
};

const main = async (): Promise<void> => {
  const rawVersion = process.argv[2];

  if (!rawVersion) {
    throw new Error('Usage: bun run scripts/release.ts <version>');
  }

  const version = normalizeVersionInput(rawVersion);
  const releaseTag = `v${version}`;

  await ensureCleanWorktree();
  await validateReleaseVersion(version);

  const updatedPaths = updateManagedVersions(version);
  if (updatedPaths.length === 0) {
    throw new Error(`No managed version files changed for ${releaseTag}.`);
  }

  await Bun.$`node ${path.join(repoRoot, 'scripts/validate-release.mjs')} ${releaseTag}`;
  await runGit(['add', '--', ...updatedPaths]);
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
