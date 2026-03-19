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
  PathRepoExtensionSourceSchema,
  ProjectExtensionSchema,
  RepoExtensionsConfigSchema,
  type GitHubRepoExtensionSource,
  type InstallRepoExtensionInput,
  type PathRepoExtensionSource,
  type ProjectExtension,
  type RepoExtensionDefinition,
  type RepoExtensionSource,
} from '@/extensions/contracts';
import { getExtensionEntryUrl } from '@/main-process/extensions/protocol';
import { ghExecutable } from '@/main-process/gh-cli';

const execFileAsync = promisify(execFile);
const DEVLAND_CONFIG_FILE = 'devland.json';
const INSTALLED_EXTENSION_METADATA_FILE = 'installation.json';
const INSTALLED_EXTENSION_PACKAGE_DIR = 'package';

const InstalledExtensionMetadataSchema = z.object({
  source: GitHubRepoExtensionSourceSchema,
  installedVersion: z.string().min(1),
  installedReleaseVersion: z.string().min(1).optional(),
  installedAt: z.number().int().nonnegative(),
});
type InstalledExtensionMetadata = z.infer<typeof InstalledExtensionMetadataSchema>;

const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const raw = await readFile(filePath, 'utf8');

  return JSON.parse(raw) as T;
};

const sanitizePathSegment = (value: string): string =>
  value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'extension';

const deriveExtensionKey = (value: string): string => {
  const normalizedValue = value.trim().replace(/\.tgz$/i, '');
  const baseName = path.posix.basename(normalizedValue).trim();

  return sanitizePathSegment(baseName);
};

const getRequestedExtensionVersionLabel = (value: string): string => {
  const normalizedValue = value.trim().replace(/\/+$/, '');
  const lastSegment = normalizedValue.split('/').filter(Boolean).at(-1);

  return lastSegment && lastSegment.length > 0 ? lastSegment : normalizedValue;
};

const getGitHubRepoUrl = (owner: string, repo: string): string =>
  `https://github.com/${owner}/${repo}`;

const parseRepoExtensionSource = (
  repoPath: string,
  definition: RepoExtensionDefinition,
): RepoExtensionSource => {
  const pathMatch = definition.source.match(/^path:(?<relativePath>.+)$/);

  if (pathMatch?.groups?.relativePath) {
    return PathRepoExtensionSourceSchema.parse({
      kind: 'path',
      raw: definition.source,
      extensionPath: path.resolve(repoPath, pathMatch.groups.relativePath),
      port: definition.port ?? null,
      extensionKey: deriveExtensionKey(pathMatch.groups.relativePath),
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

const getGitHubExtensionInstallRoot = async (
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

const getInstalledExtensionMetadataPath = async (
  source: GitHubRepoExtensionSource,
): Promise<string> =>
  path.join(await getGitHubExtensionInstallRoot(source), INSTALLED_EXTENSION_METADATA_FILE);

const getInstalledExtensionPackageRoot = async (
  source: GitHubRepoExtensionSource,
): Promise<string> =>
  path.join(await getGitHubExtensionInstallRoot(source), INSTALLED_EXTENSION_PACKAGE_DIR);

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
  try {
    const { manifest } = await readExtensionManifest(source.extensionPath);

    return ProjectExtensionSchema.parse({
      id: source.extensionKey,
      tabName: definition.tabName,
      tabIcon: definition.tabIcon,
      status: 'ready',
      name: manifest.name,
      version: manifest.version,
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
    const metadata = await readInstalledExtensionMetadata(source);

    if (metadata === null) {
      return ProjectExtensionSchema.parse({
        id: source.extensionKey,
        tabName: definition.tabName,
        tabIcon: definition.tabIcon,
        status: 'install-required',
        name: null,
        version: null,
        requestedVersion: getRequestedExtensionVersionLabel(source.version),
        commands: [],
        entryUrl: null,
        installPath: null,
        repositoryUrl: source.repoUrl,
        source,
        error: null,
      });
    }

    const installedPackageRoot = await getInstalledExtensionPackageRoot(source);
    const { manifest } = await readExtensionManifest(installedPackageRoot);
    const requestedVersion = getRequestedExtensionVersionLabel(source.version);
    const isUpToDate =
      metadata.installedReleaseVersion === source.version ||
      (
        metadata.installedReleaseVersion === undefined &&
        metadata.installedVersion === requestedVersion
      );

    return ProjectExtensionSchema.parse({
      id: source.extensionKey,
      tabName: definition.tabName,
      tabIcon: definition.tabIcon,
      status: isUpToDate ? 'ready' : 'update-available',
      name: manifest.name,
      version: manifest.version,
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
  const configPath = path.join(repoPath, DEVLAND_CONFIG_FILE);

  let configValue: unknown;

  try {
    configValue = await readJsonFile<unknown>(configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  if (
    typeof configValue !== 'object' ||
    configValue === null ||
    !('extensions' in configValue)
  ) {
    return [];
  }

  const config = RepoExtensionsConfigSchema.parse(configValue);

  return config.extensions;
};

export const getRepoExtensions = async (repoPath: string): Promise<ProjectExtension[]> => {
  const extensionDefinitions = await readRepoExtensionsConfig(repoPath);

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

export {
  DEVLAND_CONFIG_FILE,
  INSTALLED_EXTENSION_METADATA_FILE,
  getGitHubRepoUrl,
  parseRepoExtensionSource,
};
