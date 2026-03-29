import { createHash, randomBytes } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  CodeChangesMetaSchema,
  CommitWorkingTreeSelectionInputSchema,
  CommitWorkingTreeSelectionResultSchema,
  CheckGitWorktreeRemovalResultSchema,
  CreateGitWorktreeResultSchema,
  GitBranchPromptRequestsSchema,
  GitBranchHistorySchema,
  GitPromptRequestSnapshotSchema,
  RepoDetailsSchema,
  type CodeChangesMeta,
  type CheckGitWorktreeRemovalResult,
  type CommitWorkingTreeSelectionInput,
  type CommitWorkingTreeSelectionResult,
  type CodexTurnDiff,
  type CreateGitWorktreeResult,
  type GitBranchPromptRequests,
  type GitBranchHistory,
  type GitBranch,
  type GitFileStatus,
  type GitPromptRequestSnapshot,
  type GitStatus,
  type RemoveGitWorktreeReason,
  type RepoDetails,
} from '../ipc/contracts';
import { parsePatchDocument } from '@devlandapp/diff-viewer';
import { resolveCodexAttachmentPath } from './codex-attachments';

const execFileAsync = promisify(execFile);

const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const getGitExecOptions = () => ({
  timeout: 8000,
  windowsHide: true,
});

const getGitExecOptionsWithEnv = (env?: NodeJS.ProcessEnv) => ({
  ...getGitExecOptions(),
  env: env ? { ...process.env, ...env } : process.env,
});

const getGitReadOnlyExecOptions = () =>
  getGitExecOptionsWithEnv({ GIT_OPTIONAL_LOCKS: '0' });

const DEFAULT_TEXT_READ_MAX_BYTES = 256 * 1024;
const DEFAULT_BINARY_READ_MAX_BYTES = 10 * 1024 * 1024;
const MAX_GIT_BRANCH_HISTORY_COMMITS = 30;
const GIT_PROMPT_REQUEST_NOTES_REF = 'devland-prompt-requests';
export const GIT_PROMPT_REQUEST_ASSETS_REF = 'refs/devland/prompt-request-assets';
const GIT_PROMPT_REQUEST_ASSETS_COMMIT_MESSAGE = 'Devland prompt request assets';
const PROMPT_REQUEST_ASSET_EXTENSION_BY_TYPE: Record<string, string> = {
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/tiff': '.tiff',
  'image/webp': '.webp',
};

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

const getGithubCloneTargetDir = (slug: string): string => {
  const { owner, name } = splitGitHubSlug(slug);

  return path.join(homedir(), 'github.com', owner, name);
};

export const findLocalGithubRepoPath = (slug: string): string | null => {
  const targetDir = getGithubCloneTargetDir(slug);

  return existsSync(path.join(targetDir, '.git')) ? targetDir : null;
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
      getGitReadOnlyExecOptions(),
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
      throw new Error('Git is not available on this machine.', { cause: error });
    }

    throw new Error(
      gitError.stderr?.trim() ||
        'Local repository must be a Git repository with a GitHub `origin` remote.',
      { cause: error },
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
      getGitReadOnlyExecOptions(),
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
      throw new Error('Git is not available on this machine.', { cause: error });
    }

    throw new Error('Please select a Git repository.', { cause: error });
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
  const targetDir = getGithubCloneTargetDir(slug);

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

const parseGitStatusColumn = (value: string): GitFileStatus | null => {
  if (value === ' ' || value === '.') {
    return null;
  }

  if (value === '?') {
    return 'untracked';
  }

  if (value === 'R') {
    return 'renamed';
  }

  if (value === 'A' || value === 'C') {
    return 'added';
  }

  if (value === 'D') {
    return 'deleted';
  }

  return 'modified';
};

const parseGitStatusEntries = (statusOutput: string) => {
  const entries = statusOutput.split('\0').filter(Boolean);
  const files: GitStatus['files'] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    const xy = entry.slice(0, 2);
    const indexStatus = parseGitStatusColumn(xy[0] ?? ' ');
    const workingTreeStatus = parseGitStatusColumn(xy[1] ?? ' ');
    const isRenameOrCopy = xy[0] === 'R' || xy[1] === 'R' || xy[0] === 'C' || xy[1] === 'C';
    const pathStart = entry[2] === ' ' ? 3 : 2;
    const filePath = entry.slice(pathStart);
    const oldPath = isRenameOrCopy ? (entries[index + 1] ?? null) : null;

    files.push({
      path: filePath,
      oldPath,
      status: parseGitFileStatus(xy),
      hasStagedChanges: indexStatus !== null,
      hasUnstagedChanges: workingTreeStatus !== null,
    });

    if (isRenameOrCopy && oldPath !== null) {
      index += 1;
    }
  }

  return files;
};

const DETACHED_WORKTREE_TITLE = '<branch name tbd>';

const sanitizeRefForDirectory = (value: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return normalized || 'detached';
};

const buildDetachedWorktreeDirectoryName = (baseRef: string): string =>
  `${sanitizeRefForDirectory(baseRef === 'HEAD' ? 'detached' : baseRef)}-${randomBytes(4).toString('hex')}`;

const buildWorktreeBasePath = (repoPath: string): string =>
  path.join(
    homedir(),
    '.devland',
    'worktrees',
    path.basename(repoPath) || 'repo',
  );

const branchExists = async (repoPath: string, branchName: string): Promise<boolean> => {
  try {
    await execFileAsync(
      'git',
      ['-C', repoPath, 'show-ref', '--verify', '--quiet', `refs/heads/${branchName}`],
      getGitExecOptions(),
    );

    return true;
  } catch {
    return false;
  }
};

export const normalizeGitBranchNameCandidate = (value: string): string => {
  const segments = value
    .trim()
    .replace(/^codex\//i, '')
    .toLowerCase()
    .split('/')
    .map((segment) =>
      segment
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48),
    )
    .filter((segment) => segment.length > 0);

  return segments.join('/');
};

export const buildFallbackGitBranchName = (value: string): string =>
  normalizeGitBranchNameCandidate(value) || 'update';

const isValidGitBranchName = async (
  repoPath: string,
  branchName: string,
): Promise<boolean> => {
  try {
    await execFileAsync(
      'git',
      ['-C', repoPath, 'check-ref-format', '--branch', branchName],
      getGitReadOnlyExecOptions(),
    );

    return true;
  } catch {
    return false;
  }
};

const resolveUniqueBranchName = async (
  repoPath: string,
  branchName: string,
): Promise<string> => {
  if (!(await branchExists(repoPath, branchName))) {
    return branchName;
  }

  for (let suffix = 2; suffix <= 100; suffix += 1) {
    const candidate = `${branchName}-${suffix}`;

    if (!(await branchExists(repoPath, candidate))) {
      return candidate;
    }
  }

  throw new Error('Could not allocate a unique promoted worktree branch name.');
};

export const resolveGitWorktreeBranchName = async (
  repoPath: string,
  candidateBranchName: string,
  fallbackSource: string,
): Promise<string> => {
  const fallbackBranchName = buildFallbackGitBranchName(fallbackSource);
  const normalizedCandidate = normalizeGitBranchNameCandidate(candidateBranchName);
  const desiredBranchName =
    normalizedCandidate.length > 0 && (await isValidGitBranchName(repoPath, normalizedCandidate))
      ? normalizedCandidate
      : fallbackBranchName;

  if (!(await isValidGitBranchName(repoPath, desiredBranchName))) {
    throw new Error('Could not derive a valid Git branch name.');
  }

  return resolveUniqueBranchName(repoPath, desiredBranchName);
};

export const getGitBranches = async (repoPath: string): Promise<GitBranch[]> => {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', repoPath, 'branch', '--format=%(HEAD)|%(refname:short)'],
    getGitReadOnlyExecOptions(),
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

const getHeadRevision = async (repoPath: string): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'rev-parse', 'HEAD'],
      getGitReadOnlyExecOptions(),
    );
    const revision = stdout.trim();

    return revision.length > 0 ? revision : null;
  } catch {
    return null;
  }
};

export const getGitStatus = async (repoPath: string): Promise<GitStatus> => {
  const [branchResult, statusResult, headRevision] = await Promise.all([
    execFileAsync(
      'git',
      ['-C', repoPath, 'branch', '--show-current'],
      getGitReadOnlyExecOptions(),
    ),
    execFileAsync(
      'git',
      ['-C', repoPath, 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
      getGitReadOnlyExecOptions(),
    ),
    getHeadRevision(repoPath),
  ]);

  const branch = branchResult.stdout.trim() || 'HEAD';
  const files = parseGitStatusEntries(statusResult.stdout);

  return {
    branch,
    headRevision,
    files,
    hasStagedChanges: files.some((file) => file.hasStagedChanges),
  };
};

const unstageAllFiles = async (repoPath: string) => {
  if (await hasHeadCommit(repoPath)) {
    await execFileAsync(
      'git',
      ['-C', repoPath, 'reset', '--quiet', '--', '.'],
      getGitExecOptions(),
    );
    return;
  }

  await execFileAsync(
    'git',
    ['-C', repoPath, 'rm', '-r', '--cached', '--quiet', '--ignore-unmatch', '.'],
    getGitExecOptions(),
  );
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

export const createGitBranch = async (
  repoPath: string,
  branchName: string,
): Promise<void> => {
  await execFileAsync(
    'git',
    ['-C', repoPath, 'switch', '-c', branchName],
    getGitExecOptions(),
  );
};

const getUntrackedFileDiff = async (
  repoPath: string,
  filePath: string,
): Promise<string> => new Promise((resolve) => {
  execFile(
    'git',
    [
      '-C', repoPath,
      'diff',
      '--no-index',
      '--src-prefix=a/',
      '--dst-prefix=b/',
      '--',
      '/dev/null',
      filePath,
    ],
    getGitExecOptions(),
    (_error, diffOutput) => {
      resolve(diffOutput || '');
    },
  );
});

export const getGitFileDiff = async (
  repoPath: string,
  filePath: string,
): Promise<string> => {
  // Try diff against HEAD first (shows staged + unstaged changes)
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'diff', 'HEAD', '--', filePath],
      getGitReadOnlyExecOptions(),
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
      getGitReadOnlyExecOptions(),
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
      getGitReadOnlyExecOptions(),
    );

    if (stdout.trim()) {
      return stdout;
    }
  } catch {
    // fall through
  }

  // For untracked files, use --no-index which exits with code 1 when differences exist.
  return getUntrackedFileDiff(repoPath, filePath);
};

const getGitDiffOutput = async (
  repoPath: string,
  args: string[],
): Promise<string> => {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, ...args],
      getGitReadOnlyExecOptions(),
    );

    return stdout;
  } catch {
    return '';
  }
};

export const getGitWorkingTreeDiff = async (repoPath: string): Promise<string> => {
  const status = await getGitStatus(repoPath);

  if (status.files.length === 0) {
    return '';
  }

  const trackedDiff = await getGitDiffOutput(repoPath, ['diff', 'HEAD']);
  const fallbackTrackedDiff = trackedDiff.trim().length > 0
    ? trackedDiff
    : [
        await getGitDiffOutput(repoPath, ['diff']),
        await getGitDiffOutput(repoPath, ['diff', '--cached']),
      ].filter((output) => output.trim().length > 0).join('\n');

  const untrackedDiffs = await Promise.all(
    status.files
      .filter((file) => file.status === 'untracked')
      .map((file) => getUntrackedFileDiff(repoPath, file.path)),
  );
  const combinedDiff = [fallbackTrackedDiff, ...untrackedDiffs]
    .filter((output) => output.trim().length > 0)
    .join('\n');
  const diffPaths = new Set(
    parsePatchDocument(combinedDiff).files.map((file) => file.displayPath),
  );
  const missingDiffs = await Promise.all(
    status.files
      .filter((file) => !diffPaths.has(file.path))
      .map((file) => getGitFileDiff(repoPath, file.path)),
  );

  return [combinedDiff, ...missingDiffs]
    .filter((output) => output.trim().length > 0)
    .join('\n');
};

const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

async function resolveGitHeadRevision(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'rev-parse', '--verify', 'HEAD'],
      getGitReadOnlyExecOptions(),
    );

    const revision = stdout.trim();
    return revision.length > 0 ? revision : null;
  } catch {
    return null;
  }
}

export const captureGitWorkingTreeSnapshot = async (repoPath: string): Promise<string> => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'devland-turn-snapshot-'));
  const tempIndexPath = path.join(tempDir, 'index');
  const env = { GIT_INDEX_FILE: tempIndexPath };

  try {
    const headRevision = await resolveGitHeadRevision(repoPath);

    if (headRevision) {
      await execFileAsync(
        'git',
        ['-C', repoPath, 'read-tree', headRevision],
        getGitExecOptionsWithEnv(env),
      );
    }

    await execFileAsync(
      'git',
      ['-C', repoPath, 'add', '-A', '--', '.'],
      getGitExecOptionsWithEnv(env),
    );

    const { stdout: treeStdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'write-tree'],
      getGitExecOptionsWithEnv(env),
    );
    const treeRevision = treeStdout.trim();

    if (!treeRevision) {
      throw new Error('Unable to create Git tree snapshot.');
    }

    const parentArgs = headRevision ? ['-p', headRevision] : [];
    const { stdout: commitStdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'commit-tree', treeRevision, ...parentArgs, '-m', 'devland turn snapshot'],
      getGitExecOptionsWithEnv(env),
    );
    const snapshotRevision = commitStdout.trim();

    if (!snapshotRevision) {
      throw new Error('Unable to create Git commit snapshot.');
    }

    return snapshotRevision;
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
};

export const getGitSnapshotDiff = async (
  repoPath: string,
  beforeRevision: string,
  afterRevision: string,
): Promise<CodexTurnDiff | null> => {
  if (beforeRevision === afterRevision) {
    return null;
  }

  const { stdout } = await execFileAsync(
    'git',
    [
      '-C',
      repoPath,
      'diff',
      '--find-renames',
      '--src-prefix=a/',
      '--dst-prefix=b/',
      beforeRevision || EMPTY_TREE_SHA,
      afterRevision || EMPTY_TREE_SHA,
    ],
    getGitReadOnlyExecOptions(),
  );
  const patch = stdout.trim();

  if (patch.length === 0) {
    return null;
  }

  const parsed = parsePatchDocument(patch);

  return {
    patch,
    files: parsed.files.map((file) => ({
      path: file.displayPath,
      oldPath: file.oldPath,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
    })),
  };
};

export const getGitBlobText = async ({
  repoPath,
  revision,
  filePath,
  maxBytes = DEFAULT_TEXT_READ_MAX_BYTES,
}: {
  repoPath: string;
  revision: string;
  filePath: string;
  maxBytes?: number;
}): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'show', `${revision}:${filePath}`],
      {
        ...getGitReadOnlyExecOptions(),
        timeout: 15000,
        maxBuffer: Math.max(maxBytes * 2, DEFAULT_TEXT_READ_MAX_BYTES),
        encoding: 'buffer',
      },
    );

    return Buffer.from(stdout).subarray(0, maxBytes).toString('utf8');
  } catch {
    return null;
  }
};

export const getWorkingTreeFileText = async ({
  repoPath,
  filePath,
  maxBytes = DEFAULT_TEXT_READ_MAX_BYTES,
}: {
  repoPath: string;
  filePath: string;
  maxBytes?: number;
}): Promise<string | null> => {
  try {
    const absolutePath = path.join(repoPath, filePath);
    const content = readFileSync(absolutePath);

    return content.subarray(0, maxBytes).toString('utf8');
  } catch {
    return null;
  }
};

export const createGitWorktree = async (
  repoPath: string,
): Promise<CreateGitWorktreeResult> => {
  const baseBranch = await getGitDefaultBranch(repoPath);
  const basePath = buildWorktreeBasePath(repoPath);
  const directoryName = buildDetachedWorktreeDirectoryName(baseBranch);
  const targetPath = path.join(basePath, directoryName);

  mkdirSync(basePath, { recursive: true });

  await execFileAsync(
    'git',
    ['-C', repoPath, 'worktree', 'add', '--detach', targetPath, baseBranch],
    getGitExecOptions(),
  );

  return CreateGitWorktreeResultSchema.parse({
    cwd: targetPath,
    initialTitle: DETACHED_WORKTREE_TITLE,
  });
};

const getRemoveGitWorktreeReasons = async (
  worktreePath: string,
): Promise<RemoveGitWorktreeReason[]> => {
  const reasons: RemoveGitWorktreeReason[] = [];
  const status = await getGitStatus(worktreePath);

  if (status.files.length > 0) {
    reasons.push('dirty');
  }

  if (status.branch === 'HEAD' && status.headRevision !== null) {
    const { stdout } = await execFileAsync(
      'git',
      [
        '-C', worktreePath,
        'for-each-ref',
        '--contains', status.headRevision,
        '--format=%(refname)',
        'refs/heads',
        'refs/remotes',
      ],
      getGitReadOnlyExecOptions(),
    );

    if (stdout.trim().length === 0) {
      reasons.push('unreferenced-detached-head');
    }
  }

  return reasons;
};

export const checkGitWorktreeRemoval = async (
  worktreePath: string,
): Promise<CheckGitWorktreeRemovalResult> => {
  const reasons = await getRemoveGitWorktreeReasons(worktreePath);

  if (reasons.length > 0) {
    return CheckGitWorktreeRemovalResultSchema.parse({
      status: 'confirmation-required',
      reasons,
    });
  }

  return CheckGitWorktreeRemovalResultSchema.parse({
    status: 'safe',
  });
};

export const removeGitWorktree = async (
  repoPath: string,
  worktreePath: string,
  force = false,
): Promise<void> => {
  await execFileAsync(
    'git',
    ['-C', repoPath, 'worktree', 'remove', ...(force ? ['--force'] : []), worktreePath],
    getGitExecOptions(),
  );
};

const hasHeadCommit = async (repoPath: string): Promise<boolean> => {
  try {
    await execFileAsync(
      'git',
      ['-C', repoPath, 'rev-parse', '--verify', 'HEAD'],
      getGitExecOptions(),
    );

    return true;
  } catch {
    return false;
  }
};

const applyPatchToIndex = async (
  repoPath: string,
  gitEnv: NodeJS.ProcessEnv | undefined,
  patch: string,
  scratchDir: string,
  filePath: string,
) => {
  const patchPath = path.join(
    scratchDir,
    `${filePath.replace(/[\\/]/g, '_') || 'selection'}.patch`,
  );
  writeFileSync(patchPath, patch, 'utf8');

  await execFileAsync(
    'git',
    ['-C', repoPath, 'apply', '--cached', '--whitespace=nowarn', patchPath],
    getGitExecOptionsWithEnv(gitEnv),
  );
};

const stageWholeFileInIndex = async (
  repoPath: string,
  gitEnv: NodeJS.ProcessEnv | undefined,
  filePaths: string[],
) => {
  await execFileAsync(
    'git',
    ['-C', repoPath, 'add', '-A', '--', ...filePaths],
    getGitExecOptionsWithEnv(gitEnv),
  );
};

const ensureSelectionProducesChanges = async (
  repoPath: string,
  gitEnv: NodeJS.ProcessEnv | undefined,
) => {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'diff', '--cached', '--name-only'],
      getGitExecOptionsWithEnv(gitEnv),
    );

    if (stdout.trim().length === 0) {
      throw new Error('No changes are selected for commit.');
    }
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error('No changes are selected for commit.');
  }
};

export const commitWorkingTreeSelection = async (
  input: CommitWorkingTreeSelectionInput,
): Promise<CommitWorkingTreeSelectionResult> => {
  const parsedInput = CommitWorkingTreeSelectionInputSchema.parse(input);
  const scratchDir = mkdtempSync(path.join(tmpdir(), 'devland-commit-'));

  try {
    await unstageAllFiles(parsedInput.repoPath);

    for (const file of parsedInput.files) {
      await stageWholeFileInIndex(parsedInput.repoPath, undefined, file.paths);
    }

    await ensureSelectionProducesChanges(parsedInput.repoPath, undefined);

    const commitArgs = ['-C', parsedInput.repoPath, 'commit', '--cleanup=strip', '-m', parsedInput.summary];

    if (parsedInput.description.trim().length > 0) {
      commitArgs.push('-m', parsedInput.description.trim());
    }

    await execFileAsync(
      'git',
      commitArgs,
      getGitExecOptions(),
    );

    await execFileAsync(
      'git',
      ['-C', parsedInput.repoPath, 'reset', '--mixed', '--quiet', 'HEAD'],
      getGitExecOptions(),
    );

    const { stdout } = await execFileAsync(
      'git',
      ['-C', parsedInput.repoPath, 'rev-parse', 'HEAD'],
      getGitExecOptions(),
    );

    return CommitWorkingTreeSelectionResultSchema.parse({
      commitSha: stdout.trim(),
    });
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
};

export const splitDiffByFile = (rawDiff: string): Record<string, string> => {
  const fileDiffs: Record<string, string> = {};
  const fileSections = rawDiff.split(/^(?=diff --git )/m);

  for (const section of fileSections) {
    if (!section.startsWith('diff --git ')) {
      continue;
    }

    const headerLine = section.split('\n', 1)[0];
    const headerMatch = headerLine?.match(/^diff --git (?:"(.+)"|(\S+)) (?:"(.+)"|(\S+))$/);
    const nextPath = headerMatch?.[3] ?? headerMatch?.[4];

    if (!nextPath) {
      continue;
    }

    fileDiffs[nextPath.replace(/^[^/]+\//, '')] = section;
  }

  return fileDiffs;
};

const verifyRevisionExists = async (
  repoPath: string,
  revision: string,
): Promise<void> => {
  await execFileAsync(
    'git',
    ['-C', repoPath, 'rev-parse', '--verify', revision],
    { timeout: 5000, windowsHide: true },
  );
};

const resolveExistingRevision = async (
  repoPath: string,
  revisions: string[],
): Promise<string> => {
  for (const revision of revisions) {
    try {
      await verifyRevisionExists(repoPath, revision);
      return revision;
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error(`Could not resolve any of these revisions: ${revisions.join(', ')}`);
};

export const getCommitParent = async (
  repoPath: string,
  commitSha: string,
): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'rev-parse', `${commitSha}^`],
      { timeout: 5000, windowsHide: true },
    );

    return stdout.trim() || null;
  } catch {
    return null;
  }
};

const getBaseBranchRevision = async (
  repoPath: string,
  branchName: string,
): Promise<string> => {
  return resolveExistingRevision(repoPath, [
    `refs/remotes/origin/${branchName}`,
    `refs/heads/${branchName}`,
    branchName,
  ]);
};

const getHeadBranchRevision = async (
  repoPath: string,
  branchName: string,
): Promise<string> => {
  if (branchName === 'HEAD') {
    throw new Error('Current checkout is detached. Code view compare requires a branch.');
  }

  return resolveExistingRevision(repoPath, [
    `refs/heads/${branchName}`,
    branchName,
  ]);
};

export const getGitDefaultBranch = async (repoPath: string): Promise<string> => {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
      getGitReadOnlyExecOptions(),
    );
    const ref = stdout.trim();

    if (ref.startsWith('origin/')) {
      return ref.slice('origin/'.length);
    }
  } catch {
    // Fall through to common default branch names.
  }

  for (const candidate of ['main', 'master']) {
    try {
      await resolveExistingRevision(repoPath, [
        `refs/remotes/origin/${candidate}`,
        `refs/heads/${candidate}`,
        candidate,
      ]);
      return candidate;
    } catch {
      // Try the next fallback.
    }
  }

  throw new Error(
    'Could not determine the default branch from origin/HEAD or local main/master branches.',
  );
};

const parsePrCommitLogOutput = (logOutput: string): CodeChangesMeta['commits'] =>
  logOutput
    .split('\x1e')
    .map((record) => record.replace(/^[\r\n]+/, ''))
    .filter((record) => record.includes('\x1f'))
    .map((record) => {
      const fields = record.split('\x1f');

      if (fields[0] === '') {
        fields.shift();
      }

      const [
        sha = '',
        shortSha = '',
        title = '',
        authorName = '',
        authorDate = '',
        ...bodyParts
      ] = fields;

      return {
        sha,
        shortSha,
        title,
        authorName,
        authorDate,
        body: bodyParts.join('\x1f').trim(),
      };
    })
    .filter((commit) => commit.sha.length > 0);

export const getGitBranchCompareMeta = async (
  repoPath: string,
  baseBranch: string,
  headBranch: string,
): Promise<CodeChangesMeta> => {
  const baseRevision = await getBaseBranchRevision(repoPath, baseBranch);
  const headRevision = await getHeadBranchRevision(repoPath, headBranch);
  const US = '%x1f';
  const RS = '%x1e';
  const format = `${US}%H${US}%h${US}%s${US}%an${US}%aI${US}%b${RS}`;

  const { stdout: logOutput } = await execFileAsync(
    'git',
    [
      '-C', repoPath, 'log',
      `${baseRevision}..${headRevision}`,
      `--format=${format}`,
      '--reverse',
    ],
    { ...getGitReadOnlyExecOptions(), timeout: 15000 },
  );

  return CodeChangesMetaSchema.parse({
    baseBranch,
    headBranch,
    commits: parsePrCommitLogOutput(logOutput),
  });
};

async function readGitPromptRequestNote(
  repoPath: string,
  commitSha: string,
): Promise<GitPromptRequestSnapshot | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'notes', `--ref=${GIT_PROMPT_REQUEST_NOTES_REF}`, 'show', commitSha],
      { ...getGitReadOnlyExecOptions(), timeout: 15000 },
    );

    return GitPromptRequestSnapshotSchema.parse(JSON.parse(stdout));
  } catch (error) {
    const gitError = error as NodeJS.ErrnoException & { stderr?: string };

    if (gitError.stderr?.includes('no note found for object')) {
      return null;
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Prompt request note for ${commitSha} is not valid JSON.`, { cause: error });
    }

    throw error;
  }
}

export async function writeGitPromptRequestNote(input: {
  repoPath: string;
  commitSha: string;
  snapshot: GitPromptRequestSnapshot;
}): Promise<void> {
  const parsedSnapshot = await persistGitPromptRequestSnapshotAssets(
    input.repoPath,
    GitPromptRequestSnapshotSchema.parse(input.snapshot),
  );
  const tempDir = mkdtempSync(path.join(tmpdir(), 'devland-prompt-request-'));
  const tempFilePath = path.join(tempDir, 'note.json');

  try {
    writeFileSync(tempFilePath, JSON.stringify(parsedSnapshot), 'utf8');

    await execFileAsync(
      'git',
      [
        '-C',
        input.repoPath,
        'notes',
        `--ref=${GIT_PROMPT_REQUEST_NOTES_REF}`,
        'add',
        '--force',
        '--file',
        tempFilePath,
        input.commitSha,
      ],
      getGitExecOptions(),
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function getGitBranchPromptRequests(input: {
  repoPath: string;
  baseBranch: string;
  headBranch: string;
}): Promise<GitBranchPromptRequests> {
  const compareMeta = await getGitBranchCompareMeta(
    input.repoPath,
    input.baseBranch,
    input.headBranch,
  );
  const commits = await Promise.all(
    compareMeta.commits.map(async (commit) => ({
      ...commit,
      snapshot: await readGitPromptRequestNote(input.repoPath, commit.sha),
    })),
  );

  return GitBranchPromptRequestsSchema.parse({
    baseBranch: compareMeta.baseBranch,
    headBranch: compareMeta.headBranch,
    commits,
  });
}

function getPromptRequestAssetExtension(name: string, mimeType: string): string {
  const providedExtension = path.extname(name.trim());
  return providedExtension || PROMPT_REQUEST_ASSET_EXTENSION_BY_TYPE[mimeType] || '';
}

function parsePromptRequestAttachmentDataUrl(
  dataUrl: string,
): { mimeType: string; bytes: Buffer } {
  if (!dataUrl.startsWith('data:')) {
    throw new Error('Unsupported prompt request attachment URL format.');
  }

  const commaIndex = dataUrl.indexOf(',');

  if (commaIndex === -1) {
    throw new Error('Malformed prompt request attachment data URL.');
  }

  const metadata = dataUrl.slice('data:'.length, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const isBase64 = metadata.endsWith(';base64');
  const mimeType = (isBase64 ? metadata.slice(0, -';base64'.length) : metadata).trim();

  if (!isBase64) {
    throw new Error('Prompt request attachment data URL must be base64 encoded.');
  }

  return {
    mimeType,
    bytes: Buffer.from(payload, 'base64'),
  };
}

function toPromptRequestAssetPath(sha256: string, name: string, mimeType: string): string {
  return path.posix.join(
    'images',
    sha256.slice(0, 2),
    `${sha256}${getPromptRequestAssetExtension(name, mimeType)}`,
  );
}

async function resolveGitRefCommit(repoPath: string, refName: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'rev-parse', '--verify', `${refName}^{commit}`],
      getGitReadOnlyExecOptions(),
    );

    return stdout.trim() || null;
  } catch (error) {
    const gitError = error as NodeJS.ErrnoException & { stderr?: string };

    if (
      gitError.stderr?.includes('unknown revision') ||
      gitError.stderr?.includes('Needed a single revision') ||
      gitError.stderr?.includes('bad revision')
    ) {
      return null;
    }

    throw error;
  }
}

async function resolveGitCommitTree(repoPath: string, commitSha: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', repoPath, 'rev-parse', '--verify', `${commitSha}^{tree}`],
    getGitReadOnlyExecOptions(),
  );

  return stdout.trim();
}

async function hashGitBlob(repoPath: string, bytes: Buffer): Promise<string> {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'devland-prompt-request-blob-'));
  const tempFilePath = path.join(tempDir, 'asset');

  try {
    writeFileSync(tempFilePath, bytes);
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'hash-object', '-w', tempFilePath],
      getGitExecOptions(),
    );

    return stdout.trim();
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

type PreparedPromptRequestAsset = {
  attachmentPath: string;
  sha256: string;
  bytes: Buffer;
};

async function storePromptRequestAssets(
  repoPath: string,
  preparedAssets: PreparedPromptRequestAsset[],
): Promise<void> {
  if (preparedAssets.length === 0) {
    return;
  }

  const tempDir = mkdtempSync(path.join(tmpdir(), 'devland-prompt-request-assets-'));
  const indexPath = path.join(tempDir, 'index');

  try {
    const parentCommit = await resolveGitRefCommit(repoPath, GIT_PROMPT_REQUEST_ASSETS_REF);
    const indexEnv = {
      GIT_INDEX_FILE: indexPath,
    };

    if (parentCommit) {
      await execFileAsync(
        'git',
        ['-C', repoPath, 'read-tree', parentCommit],
        getGitExecOptionsWithEnv(indexEnv),
      );
    }

    for (const asset of preparedAssets) {
      const blobSha = await hashGitBlob(repoPath, asset.bytes);

      await execFileAsync(
        'git',
        [
          '-C',
          repoPath,
          'update-index',
          '--add',
          '--cacheinfo',
          '100644',
          blobSha,
          asset.attachmentPath,
        ],
        getGitExecOptionsWithEnv(indexEnv),
      );
    }

    const { stdout: treeStdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'write-tree'],
      getGitExecOptionsWithEnv(indexEnv),
    );
    const nextTree = treeStdout.trim();

    if (!nextTree) {
      return;
    }

    if (parentCommit) {
      const parentTree = await resolveGitCommitTree(repoPath, parentCommit);

      if (parentTree === nextTree) {
        return;
      }
    }

    const commitArgs = ['-C', repoPath, 'commit-tree', nextTree];

    if (parentCommit) {
      commitArgs.push('-p', parentCommit);
    }

    commitArgs.push('-m', GIT_PROMPT_REQUEST_ASSETS_COMMIT_MESSAGE);

    const { stdout: commitStdout } = await execFileAsync(
      'git',
      commitArgs,
      getGitExecOptions(),
    );
    const nextCommit = commitStdout.trim();

    if (!nextCommit) {
      throw new Error('Failed to create prompt request asset commit.');
    }

    const updateRefArgs = ['-C', repoPath, 'update-ref', GIT_PROMPT_REQUEST_ASSETS_REF, nextCommit];

    if (parentCommit) {
      updateRefArgs.push(parentCommit);
    }

    await execFileAsync('git', updateRefArgs, getGitExecOptions());
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function persistGitPromptRequestSnapshotAssets(
  repoPath: string,
  snapshot: GitPromptRequestSnapshot,
): Promise<GitPromptRequestSnapshot> {
  const preparedAssetsByPath = new Map<string, PreparedPromptRequestAsset>();

  const nextTranscriptEntries = snapshot.transcriptEntries.map((entry) => {
    if (entry.kind !== 'message') {
      return entry;
    }

    return {
      ...entry,
      message: {
        ...entry.message,
        attachments: entry.message.attachments.map((attachment) => {
          if (attachment.previewUrl === null) {
            return {
              ...attachment,
              asset: null,
            };
          }

          let bytes: Buffer;
          let mimeType = attachment.mimeType;

          if (attachment.previewUrl.startsWith('data:')) {
            const parsedAttachment = parsePromptRequestAttachmentDataUrl(attachment.previewUrl);
            bytes = parsedAttachment.bytes;
            mimeType = mimeType.trim() || parsedAttachment.mimeType;
          } else {
            const absolutePath = resolveCodexAttachmentPath(attachment.previewUrl);

            if (absolutePath === null) {
              throw new Error(`Could not resolve Codex attachment path for ${attachment.name}.`);
            }

            bytes = readFileSync(absolutePath);
          }

          const sha256 = createHash('sha256').update(bytes).digest('hex');
          const assetPath = toPromptRequestAssetPath(sha256, attachment.name, mimeType);

          if (!preparedAssetsByPath.has(assetPath)) {
            preparedAssetsByPath.set(assetPath, {
              attachmentPath: assetPath,
              sha256,
              bytes,
            });
          }

          return {
            ...attachment,
            mimeType,
            previewUrl: null,
            asset: {
              ref: GIT_PROMPT_REQUEST_ASSETS_REF,
              path: assetPath,
              sha256,
            },
          };
        }),
      },
    };
  });

  await storePromptRequestAssets(repoPath, [...preparedAssetsByPath.values()]);

  return GitPromptRequestSnapshotSchema.parse({
    ...snapshot,
    transcriptEntries: nextTranscriptEntries,
  });
}

export async function getGitPromptRequestAssetDataUrl(input: {
  repoPath: string;
  ref: string;
  assetPath: string;
  mimeType: string;
}): Promise<string> {
  const result = await execFileAsync(
    'git',
    ['-C', input.repoPath, 'show', `${input.ref}:${input.assetPath}`],
    {
      ...getGitReadOnlyExecOptions(),
      encoding: 'buffer',
      maxBuffer: DEFAULT_BINARY_READ_MAX_BYTES,
    } as Parameters<typeof execFileAsync>[2],
  ) as { stdout: Buffer };

  return `data:${input.mimeType};base64,${result.stdout.toString('base64')}`;
}

export const getGitBranchHistory = async (
  repoPath: string,
  branchName: string,
): Promise<GitBranchHistory> => {
  const branchRevision =
    branchName === 'HEAD'
      ? await getHeadRevision(repoPath)
      : await getHeadBranchRevision(repoPath, branchName);

  if (branchRevision === null) {
    return GitBranchHistorySchema.parse({
      branch: branchName,
      commits: [],
    });
  }

  const US = '%x1f';
  const RS = '%x1e';
  const format = `${US}%H${US}%h${US}%s${US}%an${US}%aI${US}%b${RS}`;

  const { stdout: logOutput } = await execFileAsync(
    'git',
    [
      '-C', repoPath, 'log',
      branchRevision,
      `--format=${format}`,
      '--date-order',
      `--max-count=${MAX_GIT_BRANCH_HISTORY_COMMITS}`,
    ],
    { timeout: 15000, windowsHide: true },
  );

  return GitBranchHistorySchema.parse({
    branch: branchName,
    commits: parsePrCommitLogOutput(logOutput),
  });
};

export const getGitBranchCompareDiff = async (
  repoPath: string,
  baseBranch: string,
  headBranch: string,
): Promise<string> => {
  const baseRevision = await getBaseBranchRevision(repoPath, baseBranch);
  const headRevision = await getHeadBranchRevision(repoPath, headBranch);
  const { stdout } = await execFileAsync(
    'git',
    ['-C', repoPath, 'diff', `${baseRevision}...${headRevision}`],
    { ...getGitReadOnlyExecOptions(), timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
  );

  return stdout;
};

export const getCommitDiff = async (
  repoPath: string,
  commitSha: string,
): Promise<string> => {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', repoPath, 'show', commitSha, '--format=', '-p'],
    { ...getGitReadOnlyExecOptions(), timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
  );

  return stdout;
};
