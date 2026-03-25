import { execFile } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

import { DevlandExtensionManifestSchema } from '@devlandapp/sdk';

import {
  GitHubRepoExtensionSourceSchema,
  InstallRepoExtensionInputSchema,
  InstallRepoExtensionVersionInputSchema,
  PathRepoExtensionSourceSchema,
  ProjectExtensionSchema,
  type RepoConfig,
  type ExtensionVersion,
  type GitHubRepoExtensionSource,
  type InstallRepoExtensionInput,
  type InstallRepoExtensionVersionInput,
  type PathRepoExtensionSource,
  type ProjectExtension,
  type RepoExtensionDefinition,
  type RepoExtensionSource,
} from '@/extensions/contracts';
import { getExtensionEntryUrl } from '@/main-process/extensions/protocol';
import { ghExecutable } from '@/main-process/gh-cli';
import { isAbsoluteRepoPath } from '@/main-process/git';
import { DEVLAND_CONFIG_FILE, readRepoConfig } from '@/main-process/repo-config';

const execFileAsync = promisify(execFile);
const INSTALLED_EXTENSION_METADATA_FILE = 'installation.json';
const INSTALLED_EXTENSION_PACKAGE_DIR = 'package';
const GITHUB_RELEASES_LIMIT = 20;

const InstalledExtensionMetadataSchema = z.object({
  source: GitHubRepoExtensionSourceSchema,
  installedVersion: z.string().min(1),
  installedReleaseVersion: z.string().min(1).optional(),
  installedAt: z.number().int().nonnegative(),
});
type InstalledExtensionMetadata = z.infer<typeof InstalledExtensionMetadataSchema>;

const GitHubReleaseAssetSchema = z.object({
  name: z.string().min(1),
  state: z.string().min(1).optional(),
});
type GitHubReleaseAsset = z.infer<typeof GitHubReleaseAssetSchema>;

const GitHubReleaseSchema = z.object({
  tag_name: z.string().min(1),
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z.array(GitHubReleaseAssetSchema).default([]),
});
type GitHubRelease = z.infer<typeof GitHubReleaseSchema>;

type NormalizedGitHubReleaseAsset = {
  name: string;
  state?: string | undefined;
};

type NormalizedGitHubRelease = {
  tagName: string;
  isDraft: boolean;
  isPrerelease: boolean;
  assets: NormalizedGitHubReleaseAsset[];
};

const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const raw = await readFile(filePath, 'utf8');

  return JSON.parse(raw) as T;
};

const sanitizePathSegment = (value: string): string =>
  value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'extension';

const encodeVersionPathSegment = (value: string): string =>
  encodeURIComponent(value.trim());

const deriveExtensionKey = (value: string): string => {
  const normalizedValue = value.trim().replace(/\.tgz$/i, '');
  const baseName = path.posix.basename(normalizedValue).trim();

  return sanitizePathSegment(baseName);
};

const normalizeRequestedExtensionVersionLabel = (value: string): string =>
  value.replace(/^v(?=\d)/i, '');

const getRequestedExtensionVersionLabel = (value: string): string => {
  const normalizedValue = value.trim().replace(/\/+$/, '');
  const lastSegment = normalizedValue.split('/').filter(Boolean).at(-1);

  return normalizeRequestedExtensionVersionLabel(
    lastSegment && lastSegment.length > 0 ? lastSegment : normalizedValue,
  );
};

const getGitHubRepoUrl = (owner: string, repo: string): string =>
  `https://github.com/${owner}/${repo}`;

const normalizeGitHubRelease = (
  release: GitHubRelease,
): NormalizedGitHubRelease => ({
  tagName: release.tag_name,
  isDraft: release.draft,
  isPrerelease: release.prerelease,
  assets: release.assets,
});

const isUploadedGitHubReleaseAsset = (
  asset: GitHubReleaseAsset,
  assetName: string,
): boolean =>
  asset.name === assetName && (asset.state === undefined || asset.state === 'uploaded');

export const selectInstallableExtensionVersions = (
  releases: NormalizedGitHubRelease[],
  assetName: string,
): ExtensionVersion[] =>
  releases
    .filter(
      (release) =>
        !release.isDraft &&
        !release.isPrerelease &&
        release.assets.some((asset) => isUploadedGitHubReleaseAsset(asset, assetName)),
    )
    .map((release) => ({
      tag: release.tagName,
      label: normalizeRequestedExtensionVersionLabel(release.tagName),
    }));

const findInstallableGithubRelease = (
  releases: NormalizedGitHubRelease[],
  tagName: string,
  assetName: string,
): NormalizedGitHubRelease | null =>
  releases.find(
    (release) =>
      release.tagName === tagName &&
      !release.isDraft &&
      release.assets.some((asset) => isUploadedGitHubReleaseAsset(asset, assetName)),
  ) ?? null;

const fetchGitHubReleases = async (owner: string, repo: string): Promise<NormalizedGitHubRelease[]> => {
  if (ghExecutable === null) {
    return [];
  }

  const { stdout } = await execFileAsync(
    ghExecutable,
    [
      'api',
      '--method',
      'GET',
      '--header',
      'Accept: application/vnd.github+json',
      `repos/${owner}/${repo}/releases?per_page=${GITHUB_RELEASES_LIMIT}`,
    ],
    {
      env: {
        ...process.env,
        GH_PROMPT_DISABLED: '1',
      },
      timeout: 30_000,
      windowsHide: true,
    },
  );

  const releases = z.array(GitHubReleaseSchema).parse(JSON.parse(stdout) as unknown[]);
  return releases.map(normalizeGitHubRelease);
};

const parseRepoExtensionSource = (
  repoPath: string,
  definition: RepoExtensionDefinition,
): RepoExtensionSource => {
  const pathMatch = definition.source.match(/^path:(?<relativePath>.+)$/);

  if (pathMatch?.groups?.relativePath) {
    const isLocalRepo = isAbsoluteRepoPath(repoPath);

    return PathRepoExtensionSourceSchema.parse({
      kind: 'path',
      raw: definition.source,
      relativePath: pathMatch.groups.relativePath,
      extensionPath: isLocalRepo
        ? path.resolve(repoPath, pathMatch.groups.relativePath)
        : null,
      port: definition.port ?? null,
      extensionKey: deriveExtensionKey(pathMatch.groups.relativePath),
      requiresClone: !isLocalRepo,
    });
  }

  const githubMatch = definition.source.match(
    /^github:(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)@(?<version>[^#]+)#(?<assetName>[^#]+\.tgz)$/i,
  );

  if (githubMatch?.groups?.owner && githubMatch.groups.repo && githubMatch.groups.version && githubMatch.groups.assetName) {
    return GitHubRepoExtensionSourceSchema.parse({
      kind: 'github',
      raw: definition.source,
      owner: githubMatch.groups.owner,
      repo: githubMatch.groups.repo,
      version: githubMatch.groups.version,
      assetName: githubMatch.groups.assetName,
      repoUrl: getGitHubRepoUrl(githubMatch.groups.owner, githubMatch.groups.repo),
      extensionKey: deriveExtensionKey(githubMatch.groups.assetName),
    });
  }

  throw new Error(`Unsupported extension source: ${definition.source}`);
};

const readExtensionManifest = async (packageRoot: string) => {
  const manifestPath = path.join(packageRoot, DEVLAND_CONFIG_FILE);
  const manifestValue = await readJsonFile<unknown>(manifestPath);

  return {
    manifestPath,
    manifest: DevlandExtensionManifestSchema.parse(manifestValue),
  };
};

const getExtensionStorageRoot = async (): Promise<string> => {
  const configuredRoot = process.env.DEVLAND_EXTENSION_STORAGE_DIR?.trim();

  if (configuredRoot) {
    await mkdir(configuredRoot, { recursive: true });
    return path.resolve(configuredRoot);
  }

  const { app } = await import('electron');
  const storageRoot = path.join(app.getPath('userData'), 'extensions');
  await mkdir(storageRoot, { recursive: true });

  return storageRoot;
};

const getGitHubExtensionBaseRoot = async (
  source: GitHubRepoExtensionSource,
): Promise<string> => {
  const storageRoot = await getExtensionStorageRoot();

  return path.join(
    storageRoot,
    sanitizePathSegment(source.owner),
    sanitizePathSegment(source.repo),
    sanitizePathSegment(source.extensionKey),
  );
};

const getGitHubExtensionInstallRoot = async (
  source: GitHubRepoExtensionSource,
): Promise<string> =>
  path.join(
    await getGitHubExtensionBaseRoot(source),
    'releases',
    encodeVersionPathSegment(source.version),
  );

const getLegacyGitHubExtensionInstallRoot = async (
  source: GitHubRepoExtensionSource,
): Promise<string> =>
  await getGitHubExtensionBaseRoot(source);

const getInstalledExtensionMetadataPath = async (
  source: GitHubRepoExtensionSource,
): Promise<string> =>
  path.join(await getGitHubExtensionInstallRoot(source), INSTALLED_EXTENSION_METADATA_FILE);

const getInstalledExtensionPackageRoot = async (
  source: GitHubRepoExtensionSource,
): Promise<string> =>
  path.join(await getGitHubExtensionInstallRoot(source), INSTALLED_EXTENSION_PACKAGE_DIR);

const getLegacyInstalledExtensionMetadataPath = async (
  source: GitHubRepoExtensionSource,
): Promise<string> =>
  path.join(await getLegacyGitHubExtensionInstallRoot(source), INSTALLED_EXTENSION_METADATA_FILE);

const getLegacyInstalledExtensionPackageRoot = async (
  source: GitHubRepoExtensionSource,
): Promise<string> =>
  path.join(await getLegacyGitHubExtensionInstallRoot(source), INSTALLED_EXTENSION_PACKAGE_DIR);

const readInstalledExtensionMetadata = async (
  source: GitHubRepoExtensionSource,
): Promise<InstalledExtensionMetadata | null> => {
  try {
    const metadataPath = await getInstalledExtensionMetadataPath(source);
    const metadataValue = await readJsonFile<unknown>(metadataPath);

    return InstalledExtensionMetadataSchema.parse(metadataValue);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
};

const readLegacyInstalledExtensionMetadata = async (
  source: GitHubRepoExtensionSource,
): Promise<InstalledExtensionMetadata | null> => {
  try {
    const metadataPath = await getLegacyInstalledExtensionMetadataPath(source);
    const metadataValue = await readJsonFile<unknown>(metadataPath);

    return InstalledExtensionMetadataSchema.parse(metadataValue);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
};

const resolveInstalledGithubExtension = async (
  source: GitHubRepoExtensionSource,
): Promise<{
  metadata: InstalledExtensionMetadata;
  packageRoot: string;
} | null> => {
  const metadata = await readInstalledExtensionMetadata(source);

  if (metadata !== null) {
    return {
      metadata,
      packageRoot: await getInstalledExtensionPackageRoot(source),
    };
  }

  const legacyMetadata = await readLegacyInstalledExtensionMetadata(source);

  if (
    legacyMetadata === null ||
    (
      legacyMetadata.installedReleaseVersion !== source.version &&
      !(
        legacyMetadata.installedReleaseVersion === undefined &&
        legacyMetadata.installedVersion === getRequestedExtensionVersionLabel(source.version)
      )
    )
  ) {
    return null;
  }

  return {
    metadata: legacyMetadata,
    packageRoot: await getLegacyInstalledExtensionPackageRoot(source),
  };
};

const findExtractedPackageRoot = async (extractRoot: string): Promise<string> => {
  const directManifestPath = path.join(extractRoot, DEVLAND_CONFIG_FILE);

  try {
    await access(directManifestPath);
    return extractRoot;
  } catch {
    const entries = await readdir(extractRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const candidateRoot = path.join(extractRoot, entry.name);
      const candidateManifestPath = path.join(candidateRoot, DEVLAND_CONFIG_FILE);

      try {
        await access(candidateManifestPath);
        return candidateRoot;
      } catch {
        continue;
      }
    }
  }

  throw new Error(
    `Downloaded extension archive does not contain a ${DEVLAND_CONFIG_FILE} package manifest.`,
  );
};

const installGithubExtension = async (source: GitHubRepoExtensionSource): Promise<void> => {
  if (ghExecutable === null) {
    throw new Error('GitHub CLI is not available on this machine.');
  }

  const workingDir = await mkdtemp(path.join(tmpdir(), 'devland-extension-'));
  const downloadDir = path.join(workingDir, 'download');
  const extractDir = path.join(workingDir, 'extract');
  const archivePath = path.join(downloadDir, source.assetName);

  try {
    await mkdir(downloadDir, { recursive: true });
    await mkdir(extractDir, { recursive: true });

    const releases = await fetchGitHubReleases(source.owner, source.repo);
    const matchedRelease = findInstallableGithubRelease(releases, source.version, source.assetName);

    if (matchedRelease === null) {
      throw new Error(
        `Release ${source.version} does not have a published ${source.assetName} asset available yet.`,
      );
    }

    await execFileAsync(
      ghExecutable,
      [
        'release',
        'download',
        source.version,
        '--repo',
        `${source.owner}/${source.repo}`,
        '--pattern',
        source.assetName,
        '--dir',
        downloadDir,
      ],
      {
        env: {
          ...process.env,
          GH_PROMPT_DISABLED: '1',
        },
        timeout: 60_000,
        windowsHide: true,
      },
    );

    await execFileAsync(
      'tar',
      ['-xzf', archivePath, '-C', extractDir],
      {
        timeout: 60_000,
        windowsHide: true,
      },
    );

    const extractedPackageRoot = await findExtractedPackageRoot(extractDir);
    const { manifest } = await readExtensionManifest(extractedPackageRoot);
    const installRoot = await getGitHubExtensionInstallRoot(source);
    const installedPackageRoot = await getInstalledExtensionPackageRoot(source);
    const metadataPath = await getInstalledExtensionMetadataPath(source);

    await rm(installRoot, { recursive: true, force: true });
    await mkdir(installRoot, { recursive: true });
    await cp(extractedPackageRoot, installedPackageRoot, { recursive: true });
    await writeFile(
      metadataPath,
      JSON.stringify(
        InstalledExtensionMetadataSchema.parse({
          source,
          installedVersion: manifest.version,
          installedReleaseVersion: source.version,
          installedAt: Date.now(),
        }),
        null,
        2,
      ),
      'utf8',
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      throw new Error(
        'Could not install the extension because a required system tool is unavailable.',
        { cause: error },
      );
    }

    throw error;
  } finally {
    await rm(workingDir, { recursive: true, force: true });
  }
};

const buildProjectExtensionError = (
  source: RepoExtensionSource,
  definition: RepoExtensionDefinition,
  message: string,
): ProjectExtension =>
  ProjectExtensionSchema.parse({
    id: source.extensionKey,
    tabName: definition.tabName,
    tabIcon: definition.tabIcon,
    status: 'error',
    name: null,
    version: null,
    installedReleaseVersion: null,
    requestedVersion: source.kind === 'github' ? getRequestedExtensionVersionLabel(source.version) : null,
    commands: [],
    entryUrl: null,
    installPath: null,
    repositoryUrl: source.kind === 'github' ? source.repoUrl : null,
    source,
    error: message,
  });

const buildPathProjectExtension = async (
  source: PathRepoExtensionSource,
  definition: RepoExtensionDefinition,
): Promise<ProjectExtension> => {
  if (source.requiresClone || source.extensionPath === null) {
    return ProjectExtensionSchema.parse({
      id: source.extensionKey,
      tabName: definition.tabName,
      tabIcon: definition.tabIcon,
      status: 'clone-required',
      name: null,
      version: null,
      installedReleaseVersion: null,
      requestedVersion: null,
      commands: [],
      entryUrl: null,
      installPath: null,
      repositoryUrl: null,
      source,
      error: null,
    });
  }

  try {
    const { manifest } = await readExtensionManifest(source.extensionPath);

    return ProjectExtensionSchema.parse({
      id: source.extensionKey,
      tabName: definition.tabName,
      tabIcon: definition.tabIcon,
      status: 'ready',
      name: manifest.name,
      version: manifest.version,
      installedReleaseVersion: null,
      requestedVersion: manifest.version,
      commands: manifest.commands,
      entryUrl:
        source.port === null
          ? getExtensionEntryUrl(source.extensionPath, manifest.entry)
          : `http://127.0.0.1:${source.port}/`,
      installPath: source.extensionPath,
      repositoryUrl: null,
      source,
      error: null,
    });
  } catch (error) {
    return buildProjectExtensionError(
      source,
      definition,
      error instanceof Error
        ? error.message
        : 'Could not resolve the local extension package.',
    );
  }
};

const buildGithubProjectExtension = async (
  source: GitHubRepoExtensionSource,
  definition: RepoExtensionDefinition,
): Promise<ProjectExtension> => {
  try {
    const installedExtension = await resolveInstalledGithubExtension(source);

    if (installedExtension === null) {
      return ProjectExtensionSchema.parse({
        id: source.extensionKey,
        tabName: definition.tabName,
        tabIcon: definition.tabIcon,
        status: 'install-required',
        name: null,
        version: null,
        installedReleaseVersion: null,
        requestedVersion: getRequestedExtensionVersionLabel(source.version),
        commands: [],
        entryUrl: null,
        installPath: null,
        repositoryUrl: source.repoUrl,
        source,
        error: null,
      });
    }

    const { metadata, packageRoot: installedPackageRoot } = installedExtension;
    const { manifest } = await readExtensionManifest(installedPackageRoot);
    const requestedVersion = getRequestedExtensionVersionLabel(source.version);
    const installedReleaseVersion =
      metadata.installedReleaseVersion ??
      (
        metadata.installedVersion === requestedVersion
          ? source.version
          : null
      );

    return ProjectExtensionSchema.parse({
      id: source.extensionKey,
      tabName: definition.tabName,
      tabIcon: definition.tabIcon,
      status: 'ready',
      name: manifest.name,
      version: manifest.version,
      installedReleaseVersion,
      requestedVersion,
      commands: manifest.commands,
      entryUrl: getExtensionEntryUrl(installedPackageRoot, manifest.entry),
      installPath: installedPackageRoot,
      repositoryUrl: source.repoUrl,
      source,
      error: null,
    });
  } catch (error) {
    return buildProjectExtensionError(
      source,
      definition,
      error instanceof Error
        ? error.message
        : 'Could not resolve the installed extension package.',
    );
  }
};

const buildProjectExtension = async (
  repoPath: string,
  definition: RepoExtensionDefinition,
): Promise<ProjectExtension> => {
  const source = parseRepoExtensionSource(repoPath, definition);

  if (source.kind === 'path') {
    return await buildPathProjectExtension(source, definition);
  }

  return await buildGithubProjectExtension(source, definition);
};

const readRepoExtensionsConfig = async (repoPath: string): Promise<RepoExtensionDefinition[]> => {
  const config = await readRepoConfig(repoPath);
  return config.extensions;
};

export const getRepoExtensions = async (
  repoPath: string,
  dependencies?: {
    readRepoConfig?: (repoPath: string) => Promise<RepoConfig>;
  },
): Promise<ProjectExtension[]> => {
  const extensionDefinitions = dependencies?.readRepoConfig
    ? (await dependencies.readRepoConfig(repoPath)).extensions
    : await readRepoExtensionsConfig(repoPath);

  return await Promise.all(
    extensionDefinitions.map(async (definition) => await buildProjectExtension(repoPath, definition)),
  );
};

export const getRepoExtensionById = async (
  repoPath: string,
  extensionId: string,
): Promise<ProjectExtension> => {
  const extensions = await getRepoExtensions(repoPath);
  const extension = extensions.find((candidate) => candidate.id === extensionId) ?? null;

  if (extension === null) {
    throw new Error(`Unknown extension: ${extensionId}`);
  }

  return extension;
};

export const installRepoExtension = async (
  input: InstallRepoExtensionInput,
): Promise<void> => {
  const parsedInput = InstallRepoExtensionInputSchema.parse(input);
  const extension = await getRepoExtensionById(parsedInput.repoPath, parsedInput.extensionId);

  if (extension.source.kind !== 'github') {
    throw new Error('Only GitHub-backed extensions can be installed.');
  }

  await installGithubExtension(extension.source);
};

export const listExtensionVersions = async (
  repoPath: string,
  extensionId: string,
): Promise<ExtensionVersion[]> => {
  const extension = await getRepoExtensionById(repoPath, extensionId);

  if (extension.source.kind === 'path') {
    return extension.version !== null
      ? [{ tag: extension.version, label: extension.version }]
      : [];
  }

  if (ghExecutable === null) {
    return extension.version !== null
      ? [{ tag: extension.source.version, label: extension.version }]
      : [];
  }

  try {
    const releases = await fetchGitHubReleases(
      extension.source.owner,
      extension.source.repo,
    );

    return selectInstallableExtensionVersions(releases, extension.source.assetName);
  } catch {
    return extension.version !== null
      ? [{ tag: extension.source.version, label: extension.version }]
      : [];
  }
};

const updateRepoConfigExtensionVersion = async (
  repoPath: string,
  extensionId: string,
  newVersionTag: string,
): Promise<void> => {
  const configPath = path.join(repoPath, DEVLAND_CONFIG_FILE);
  let configValue: Record<string, unknown>;

  try {
    const raw = await readFile(configPath, 'utf8');
    configValue = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }

  const extensions = configValue.extensions;

  if (!Array.isArray(extensions)) {
    return;
  }

  const extension = await getRepoExtensionById(repoPath, extensionId);

  if (extension.source.kind !== 'github') {
    return;
  }

  const sourcePrefix = `github:${extension.source.owner}/${extension.source.repo}@`;
  const assetSuffix = `#${extension.source.assetName}`;

  let updated = false;

  for (const entry of extensions) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      'source' in entry &&
      typeof (entry as Record<string, unknown>).source === 'string'
    ) {
      const source = (entry as Record<string, unknown>).source as string;

      if (source.startsWith(sourcePrefix) && source.endsWith(assetSuffix)) {
        (entry as Record<string, unknown>).source = `${sourcePrefix}${newVersionTag}${assetSuffix}`;
        updated = true;
        break;
      }
    }
  }

  if (updated) {
    await writeFile(configPath, JSON.stringify(configValue, null, 2) + '\n', 'utf8');
  }
};

export const installRepoExtensionVersion = async (
  input: InstallRepoExtensionVersionInput,
): Promise<void> => {
  const parsedInput = InstallRepoExtensionVersionInputSchema.parse(input);
  const extension = await getRepoExtensionById(parsedInput.repoPath, parsedInput.extensionId);

  if (extension.source.kind !== 'github') {
    throw new Error('Only GitHub-backed extensions support version selection.');
  }

  const modifiedSource: GitHubRepoExtensionSource = {
    ...extension.source,
    version: parsedInput.version,
  };

  await installGithubExtension(modifiedSource);
  await updateRepoConfigExtensionVersion(
    parsedInput.repoPath,
    parsedInput.extensionId,
    parsedInput.version,
  );
};

export {
  DEVLAND_CONFIG_FILE,
  INSTALLED_EXTENSION_METADATA_FILE,
  getGitHubRepoUrl,
  parseRepoExtensionSource,
};
