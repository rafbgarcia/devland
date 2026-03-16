import { randomBytes } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

import {
  CodeChangesMetaSchema,
  CommitWorkingTreeSelectionInputSchema,
  CommitWorkingTreeSelectionResultSchema,
  CreateGitWorktreeResultSchema,
  GitBranchHistorySchema,
  PrDiffMetaResultSchema,
  PromoteGitWorktreeBranchResultSchema,
  RepoDetailsSchema,
  type CodeChangesMeta,
  type CommitWorkingTreeSelectionInput,
  type CommitWorkingTreeSelectionResult,
  type CreateGitWorktreeResult,
  type GitBranchHistory,
  type GitBranch,
  type GitFileStatus,
  type GitStatus,
  type PrDiffMeta,
  type PrDiffMetaResult,
  type PromoteGitWorktreeBranchResult,
  type RepoDetails,
} from '../ipc/contracts';
import { parseUnifiedDiffDocument } from '../lib/diff';

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

const DEFAULT_TEXT_READ_MAX_BYTES = 256 * 1024;

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

const CODEX_WORKTREE_BRANCH_PREFIX = 'codex';
const TEMPORARY_WORKTREE_BRANCH_PATTERN = /^codex\/[0-9a-f]{8}$/;

const sanitizeBranchForDirectory = (branchName: string): string =>
  branchName.replace(/[\\/]+/g, '-');

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

const createTemporaryWorktreeBranchName = async (repoPath: string): Promise<string> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${CODEX_WORKTREE_BRANCH_PREFIX}/${randomBytes(4).toString('hex')}`;

    if (!(await branchExists(repoPath, candidate))) {
      return candidate;
    }
  }

  throw new Error('Could not allocate a temporary worktree branch name.');
};

const slugifyBranchName = (value: string): string => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return slug || 'task';
};

const resolveUniqueBranchName = async (
  repoPath: string,
  branchName: string,
): Promise<string> => {
  if (!(await branchExists(repoPath, branchName))) {
    return branchName;
  }

  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const candidate = `${branchName}-${suffix}`;

    if (!(await branchExists(repoPath, candidate))) {
      return candidate;
    }
  }

  throw new Error('Could not allocate a unique promoted worktree branch name.');
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

const getHeadRevision = async (repoPath: string): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'rev-parse', 'HEAD'],
      getGitExecOptions(),
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
      getGitExecOptions(),
    ),
    execFileAsync(
      'git',
      ['-C', repoPath, 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
      getGitExecOptions(),
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
      getGitExecOptions(),
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
    parseUnifiedDiffDocument(combinedDiff).files.map((file) => file.displayPath),
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
        timeout: 15000,
        windowsHide: true,
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
  baseBranch: string,
): Promise<CreateGitWorktreeResult> => {
  const branch = await createTemporaryWorktreeBranchName(repoPath);
  const basePath = buildWorktreeBasePath(repoPath);
  const directoryName = sanitizeBranchForDirectory(branch);
  const targetPath = path.join(basePath, directoryName);

  mkdirSync(basePath, { recursive: true });

  await execFileAsync(
    'git',
    ['-C', repoPath, 'worktree', 'add', '-b', branch, targetPath, baseBranch],
    getGitExecOptions(),
  );

  return CreateGitWorktreeResultSchema.parse({
    cwd: targetPath,
    branch,
  });
};

export const promoteGitWorktreeBranch = async (
  repoPath: string,
  currentBranch: string,
  prompt: string,
): Promise<PromoteGitWorktreeBranchResult> => {
  if (!TEMPORARY_WORKTREE_BRANCH_PATTERN.test(currentBranch)) {
    return PromoteGitWorktreeBranchResultSchema.parse({
      branch: currentBranch,
    });
  }

  const desiredBaseBranch = `${CODEX_WORKTREE_BRANCH_PREFIX}/${slugifyBranchName(prompt)}`;
  const nextBranch = await resolveUniqueBranchName(repoPath, desiredBaseBranch);

  if (nextBranch !== currentBranch) {
    await execFileAsync(
      'git',
      ['-C', repoPath, 'branch', '-m', nextBranch],
      getGitExecOptions(),
    );
  }

  return PromoteGitWorktreeBranchResultSchema.parse({
    branch: nextBranch,
  });
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
      if (file.kind === 'partial') {
        if (!file.patch) {
          throw new Error(`Missing partial patch for ${file.path}.`);
        }

        await applyPatchToIndex(
          parsedInput.repoPath,
          undefined,
          file.patch,
          scratchDir,
          file.path,
        );
        continue;
      }

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

const GH_EXEC_OPTIONS = {
  env: { ...process.env, GH_PROMPT_DISABLED: '1' },
  timeout: 30000,
  windowsHide: true,
};

const OPEN_PR_METADATA_SCHEMA_FIELDS = 'number,headRefName,baseRefName';
const PrReviewSnapshotMetadataSchema = z.object({
  baseBranch: z.string().min(1),
  headBranch: z.string().min(1),
});
type PrReviewSnapshotMetadata = z.infer<typeof PrReviewSnapshotMetadataSchema>;

const prHeadRef = (prNumber: number) => `refs/devland/pr/${prNumber}/head`;
const repoReviewSyncInFlight = new Map<string, Promise<void>>();

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
      getGitExecOptions(),
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

const getGitCommonDir = async (repoPath: string): Promise<string> => {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', repoPath, 'rev-parse', '--git-common-dir'],
    getGitExecOptions(),
  );

  return path.resolve(repoPath, stdout.trim());
};

const getPrSnapshotMetadataPath = async (
  repoPath: string,
  prNumber: number,
): Promise<string> => {
  const gitCommonDir = await getGitCommonDir(repoPath);

  return path.join(gitCommonDir, 'devland', 'pr', `${prNumber}.json`);
};

const readPrSnapshotMetadata = async (
  repoPath: string,
  prNumber: number,
): Promise<PrReviewSnapshotMetadata | null> => {
  const snapshotPath = await getPrSnapshotMetadataPath(repoPath, prNumber);

  if (!existsSync(snapshotPath)) {
    return null;
  }

  try {
    return PrReviewSnapshotMetadataSchema.parse(
      JSON.parse(readFileSync(snapshotPath, 'utf8')),
    );
  } catch {
    return null;
  }
};

const writePrSnapshotMetadata = async (
  repoPath: string,
  prNumber: number,
  metadata: PrReviewSnapshotMetadata,
): Promise<void> => {
  const snapshotPath = await getPrSnapshotMetadataPath(repoPath, prNumber);
  mkdirSync(path.dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, JSON.stringify(metadata), 'utf8');
};

const listOpenPrSnapshotMetadata = async (
  ghExec: string,
  owner: string,
  name: string,
): Promise<Array<{ prNumber: number; metadata: PrReviewSnapshotMetadata }>> => {
  const { stdout } = await execFileAsync(
    ghExec,
    [
      'pr', 'list',
      '--repo', `${owner}/${name}`,
      '--state', 'open',
      '--limit', '200',
      '--json', OPEN_PR_METADATA_SCHEMA_FIELDS,
    ],
    GH_EXEC_OPTIONS,
  );

  return z.array(
    z.object({
      number: z.number().int().positive(),
      headRefName: z.string().min(1),
      baseRefName: z.string().min(1),
    }),
  ).parse(JSON.parse(stdout.trim())).map((pr) => ({
    prNumber: pr.number,
    metadata: {
      baseBranch: pr.baseRefName,
      headBranch: pr.headRefName,
    },
  }));
};

const fetchAllRepoReviewRefs = async (repoPath: string): Promise<void> => {
  await execFileAsync(
    'git',
    [
      '-C', repoPath, 'fetch', 'origin', '--prune',
      '+refs/heads/*:refs/remotes/origin/*',
      '+refs/pull/*/head:refs/devland/pr/*/head',
    ],
    { timeout: 120000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
  );
};

const readLocalPrSnapshot = async (
  repoPath: string,
  prNumber: number,
): Promise<
  | { status: 'ready'; metadata: PrReviewSnapshotMetadata; baseRevision: string; headRef: string }
  | { status: 'missing'; reason: 'missing-snapshot' | 'missing-refs'; message: string }
> => {
  const metadata = await readPrSnapshotMetadata(repoPath, prNumber);

  if (metadata === null) {
    return {
      status: 'missing',
      reason: 'missing-snapshot',
      message: 'No local PR snapshot is available yet.',
    };
  }

  const baseRevision = `refs/remotes/origin/${metadata.baseBranch}`;
  const headRef = prHeadRef(prNumber);

  try {
    await Promise.all([
      verifyRevisionExists(repoPath, baseRevision),
      verifyRevisionExists(repoPath, headRef),
    ]);
  } catch {
    return {
      status: 'missing',
      reason: 'missing-refs',
      message: 'The local PR snapshot is incomplete. Run sync again.',
    };
  }

  return {
    status: 'ready',
    metadata,
    baseRevision,
    headRef,
  };
};

const loadLocalPrDiffMeta = async (
  repoPath: string,
  prNumber: number,
): Promise<PrDiffMetaResult> => {
  const snapshot = await readLocalPrSnapshot(repoPath, prNumber);

  if (snapshot.status === 'missing') {
    return PrDiffMetaResultSchema.parse(snapshot);
  }

  const US = '%x1f';
  const RS = '%x1e';
  const format = `${US}%H${US}%h${US}%s${US}%an${US}%aI${US}%b${RS}`;

  const { stdout: logOutput } = await execFileAsync(
    'git',
    [
      '-C', repoPath, 'log',
      `${snapshot.baseRevision}..${snapshot.headRef}`,
      `--format=${format}`,
      '--reverse',
    ],
    { timeout: 15000, windowsHide: true },
  );

  const commits = parsePrCommitLogOutput(logOutput);

  return PrDiffMetaResultSchema.parse({
    status: 'ready',
    baseBranch: snapshot.metadata.baseBranch,
    headBranch: snapshot.metadata.headBranch,
    baseRevision: snapshot.baseRevision,
    headRevision: snapshot.headRef,
    commits,
  });
};

const requireLocalPrSnapshot = async (
  repoPath: string,
  prNumber: number,
): Promise<{ metadata: PrReviewSnapshotMetadata; baseRevision: string; headRef: string }> => {
  const snapshot = await readLocalPrSnapshot(repoPath, prNumber);

  if (snapshot.status === 'missing') {
    throw new Error(snapshot.message);
  }

  return snapshot;
};

const performRepoReviewRefsSync = async (
  repoPath: string,
  ghExec: string,
  owner: string,
  name: string,
): Promise<void> => {
  const openPrs = await listOpenPrSnapshotMetadata(ghExec, owner, name);

  await fetchAllRepoReviewRefs(repoPath);

  await Promise.all(
    openPrs.map(async ({ prNumber, metadata }) => {
      await verifyRevisionExists(repoPath, `refs/remotes/origin/${metadata.baseBranch}`);
      await verifyRevisionExists(repoPath, prHeadRef(prNumber));
      await writePrSnapshotMetadata(repoPath, prNumber, metadata);
    }),
  );
};

const parsePrCommitLogOutput = (logOutput: string): PrDiffMeta['commits'] =>
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
    { timeout: 15000, windowsHide: true },
  );

  return CodeChangesMetaSchema.parse({
    baseBranch,
    headBranch,
    commits: parsePrCommitLogOutput(logOutput),
  });
};

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
      '--max-count=200',
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
    { timeout: 30000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
  );

  return stdout;
};

export const getPrDiffMeta = async (
  repoPath: string,
  prNumber: number,
): Promise<PrDiffMetaResult> => loadLocalPrDiffMeta(repoPath, prNumber);

export const syncRepoReviewRefs = async (
  repoPath: string,
  ghExec: string,
  owner: string,
  name: string,
): Promise<void> => {
  const existing = repoReviewSyncInFlight.get(repoPath);

  if (existing) {
    return existing;
  }

  const syncPromise = performRepoReviewRefsSync(repoPath, ghExec, owner, name)
    .finally(() => {
      if (repoReviewSyncInFlight.get(repoPath) === syncPromise) {
        repoReviewSyncInFlight.delete(repoPath);
      }
    });

  repoReviewSyncInFlight.set(repoPath, syncPromise);

  return syncPromise;
};

export const getCommitDiff = async (
  repoPath: string,
  commitSha: string,
): Promise<string> => {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', repoPath, 'show', commitSha, '--format=', '-p'],
    { timeout: 30000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
  );

  return stdout;
};

export const getPrDiff = async (
  repoPath: string,
  prNumber: number,
): Promise<string> => {
  const snapshot = await requireLocalPrSnapshot(repoPath, prNumber);

  const { stdout } = await execFileAsync(
    'git',
    ['-C', repoPath, 'diff', `${snapshot.baseRevision}...${snapshot.headRef}`],
    { timeout: 30000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
  );

  return stdout;
};
