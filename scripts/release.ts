#!/usr/bin/env bun

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  compareSemver,
  extractVersionFromTag,
  normalizeVersionInput,
  parseSemver,
  parseGitHubExtensionSource,
  rewriteGitHubExtensionSourceVersion,
} from './release-utils';

type ReleaseVersionTarget = {
  label: string;
  relativePath: string;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const listLocalExtensionArchiveNames = (): Set<string> =>
  new Set(
    fs
      .readdirSync(path.join(repoRoot, 'extensions'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${entry.name}.tgz`),
  );

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

export { compareSemver, extractVersionFromTag };

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

const updateRootRepoConfigExtensionSources = (version: string): string | null => {
  const repoConfigPath = 'devland.json';
  const repoConfig = readJsonFile(repoConfigPath);
  const localExtensionArchives = listLocalExtensionArchiveNames();
  const configuredExtensions = Array.isArray(repoConfig.extensions) ? repoConfig.extensions : null;

  if (configuredExtensions === null) {
    return null;
  }

  let didChange = false;
  const nextExtensions = configuredExtensions.map((extension) => {
    if (typeof extension !== 'object' || extension === null) {
      return extension;
    }

    const source = extension.source;

    if (typeof source !== 'string') {
      return extension;
    }

    const parsedSource = parseGitHubExtensionSource(source);

    if (parsedSource === null || !localExtensionArchives.has(parsedSource.assetName)) {
      return extension;
    }

    const nextSource = rewriteGitHubExtensionSourceVersion(source, version);

    if (nextSource === source) {
      return extension;
    }

    didChange = true;

    return {
      ...extension,
      source: nextSource,
    };
  });

  if (!didChange) {
    return null;
  }

  repoConfig.extensions = nextExtensions;
  writeJsonFile(repoConfigPath, repoConfig);

  return repoConfigPath;
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
  const updatedRepoConfigPath = updateRootRepoConfigExtensionSources(version);

  if (updatedRepoConfigPath !== null) {
    updatedPaths.push(updatedRepoConfigPath);
  }

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
