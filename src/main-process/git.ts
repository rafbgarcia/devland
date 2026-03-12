import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const getGitExecOptions = () => ({
  timeout: 8000,
  windowsHide: true,
});

const normalizeGitHubSlug = (value: string): string | null => {
  const normalizedValue = value.trim().replace(/\.git$/i, '').replace(/\/$/, '');

  if (!GITHUB_REPO_PATTERN.test(normalizedValue)) {
    return null;
  }

  return normalizedValue;
};

const parseGitHubSlugFromRemoteUrl = (remoteUrl: string): string | null => {
  const scpMatch = remoteUrl.match(
    /^(?:ssh:\/\/)?git@github\.com[:/](?<slug>[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i,
  );

  if (scpMatch?.groups?.slug) {
    return normalizeGitHubSlug(scpMatch.groups.slug);
  }

  try {
    const parsedUrl = new URL(remoteUrl);

    if (parsedUrl.hostname.toLowerCase() !== 'github.com') {
      return null;
    }

    return normalizeGitHubSlug(parsedUrl.pathname.slice(1));
  } catch {
    return null;
  }
};

export const isAbsoluteRepoPath = (value: string): boolean =>
  path.isAbsolute(value) ||
  path.posix.isAbsolute(value) ||
  path.win32.isAbsolute(value);

export const isGitHubRepoReference = (value: string): boolean =>
  GITHUB_REPO_PATTERN.test(value);

export const normalizeRepoInput = (value: string): string => {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error('Repository path is required.');
  }

  if (isAbsoluteRepoPath(trimmedValue)) {
    return path.normalize(trimmedValue);
  }

  if (isGitHubRepoReference(trimmedValue)) {
    return trimmedValue;
  }

  throw new Error(
    'Repository must be an absolute path or a GitHub owner/repository string.',
  );
};

export const getProjectLabel = (projectPath: string): string => {
  if (isAbsoluteRepoPath(projectPath)) {
    return path.basename(projectPath) || projectPath;
  }

  return projectPath;
};

export const resolveGitHubSlugFromProjectPath = async (
  projectPath: string,
): Promise<string> => {
  if (isGitHubRepoReference(projectPath)) {
    return projectPath;
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', projectPath, 'remote', 'get-url', 'origin'],
      getGitExecOptions(),
    );
    const remoteUrl = stdout.trim();
    const githubSlug = parseGitHubSlugFromRemoteUrl(remoteUrl);

    if (githubSlug === null) {
      throw new Error('Local repository must have a GitHub `origin` remote.');
    }

    return githubSlug;
  } catch (error) {
    const gitError = error as NodeJS.ErrnoException & { stderr?: string };

    if (gitError.code === 'ENOENT') {
      throw new Error('Git is not available on this machine.');
    }

    throw new Error(
      gitError.stderr?.trim() ||
        'Local repository must be a Git repository with a GitHub `origin` remote.',
    );
  }
};
