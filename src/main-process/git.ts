import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  RepoDetailsSchema,
  type GitBranch,
  type GitFileStatus,
  type GitStatus,
  type RepoDetails,
} from '../ipc/contracts';

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

export const splitGitHubSlug = (slug: string): { owner: string; name: string } => {
  const [owner = '', name = ''] = slug.split('/');

  return { owner, name };
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

export const validateLocalGitRepository = async (
  directoryPath: string,
): Promise<void> => {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', directoryPath, 'rev-parse', '--show-toplevel'],
      getGitExecOptions(),
    );
    const repoRoot = path.resolve(stdout.trim());
    const normalizedInput = path.resolve(directoryPath);

    if (normalizedInput !== repoRoot) {
      throw new Error(
        `This directory is inside a Git repository rooted at ${repoRoot}. Use the repository root instead.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('rooted at')) {
      throw error;
    }

    const gitError = error as NodeJS.ErrnoException & { stderr?: string };

    if (gitError.code === 'ENOENT') {
      throw new Error('Git is not available on this machine.');
    }

    throw new Error('Please select a Git repository.');
  }
};

export const getGithubRepoDetails = async (projectPath: string): Promise<RepoDetails> => {
  const githubSlug = await resolveGitHubSlugFromProjectPath(projectPath);
  const { owner, name } = splitGitHubSlug(githubSlug);

  return RepoDetailsSchema.parse({
    projectPath,
    githubSlug,
    owner,
    name,
  });
};

export const cloneGithubRepo = (
  ghExecutable: string,
  slug: string,
  onProgress?: (line: string) => void,
): Promise<string> => {
  const { owner, name } = splitGitHubSlug(slug);
  const targetDir = path.join(homedir(), 'github.com', owner, name);

  if (existsSync(path.join(targetDir, '.git'))) {
    return Promise.resolve(targetDir);
  }

  mkdirSync(path.dirname(targetDir), { recursive: true });

  return new Promise((resolve, reject) => {
    const proc = spawn(ghExecutable, ['repo', 'clone', slug, targetDir], {
      env: { ...process.env, GH_PROMPT_DISABLED: '1' },
      windowsHide: true,
    });

    const collectOutput = (data: Buffer) => {
      const lines = data.toString().split(/\r?\n/).filter(Boolean);

      for (const line of lines) {
        onProgress?.(line);
      }
    };

    proc.stdout.on('data', collectOutput);
    proc.stderr.on('data', collectOutput);

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(targetDir);
      } else {
        reject(new Error(`Clone failed with exit code ${code}.`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start clone: ${err.message}`));
    });
  });
};

const parseGitFileStatus = (xy: string): GitFileStatus => {
  if (xy === '??') return 'untracked';
  if (xy[0] === 'R' || xy[1] === 'R') return 'renamed';
  if (xy[0] === 'A' || xy[1] === 'A') return 'added';
  if (xy[0] === 'D' || xy[1] === 'D') return 'deleted';

  return 'modified';
};

export const getGitBranches = async (repoPath: string): Promise<GitBranch[]> => {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', repoPath, 'branch', '--format=%(HEAD)|%(refname:short)'],
    getGitExecOptions(),
  );

  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [head, ...nameParts] = line.split('|');

      return { name: nameParts.join('|'), isCurrent: head === '*' };
    });
};

export const getGitStatus = async (repoPath: string): Promise<GitStatus> => {
  const [branchResult, statusResult] = await Promise.all([
    execFileAsync(
      'git',
      ['-C', repoPath, 'branch', '--show-current'],
      getGitExecOptions(),
    ),
    execFileAsync(
      'git',
      ['-C', repoPath, 'status', '--porcelain=v1'],
      getGitExecOptions(),
    ),
  ]);

  const branch = branchResult.stdout.trim() || 'HEAD';
  const files = statusResult.stdout
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const xy = line.slice(0, 2);
      const filePath = line.slice(3);

      return { path: filePath, status: parseGitFileStatus(xy) };
    });

  return { branch, files };
};

export const checkoutGitBranch = async (
  repoPath: string,
  branchName: string,
): Promise<void> => {
  await execFileAsync(
    'git',
    ['-C', repoPath, 'checkout', branchName],
    getGitExecOptions(),
  );
};

export const getGitFileDiff = async (
  repoPath: string,
  filePath: string,
): Promise<string> => {
  // Try diff against HEAD first (shows staged + unstaged changes)
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'diff', 'HEAD', '--', filePath],
      getGitExecOptions(),
    );

    if (stdout.trim()) {
      return stdout;
    }
  } catch {
    // HEAD may not exist (empty repo), fall through
  }

  // Try working tree diff (unstaged changes only)
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'diff', '--', filePath],
      getGitExecOptions(),
    );

    if (stdout.trim()) {
      return stdout;
    }
  } catch {
    // fall through
  }

  // Try staged diff
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'diff', '--cached', '--', filePath],
      getGitExecOptions(),
    );

    if (stdout.trim()) {
      return stdout;
    }
  } catch {
    // fall through
  }

  // For untracked files, use --no-index which exits with code 1 when differences exist.
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', repoPath, 'diff', '--no-index', '--', '/dev/null', filePath],
      getGitExecOptions(),
      (_error, diffOutput) => {
        resolve(diffOutput || '');
      },
    );
  });
};
