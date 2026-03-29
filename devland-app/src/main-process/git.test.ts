import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

import { parsePatchDocument } from '@devlandapp/diff-viewer';
import {
  checkGitWorktreeRemoval,
  commitWorkingTreeSelection,
  createGitWorktree,
  GIT_PROMPT_REQUEST_ASSETS_REF,
  getGitDefaultBranch,
  getGitBranchHistory,
  writeGitPromptRequestNote,
  getGitStatus,
  getGitWorkingTreeDiff,
  removeGitWorktree,
} from '@/main-process/git';

const execFileAsync = promisify(execFile);

async function execGit(cwd: string, args: string[]) {
  return execFileAsync('git', ['-C', cwd, ...args], {
    timeout: 15000,
    windowsHide: true,
  });
}

async function createCommittedRepo() {
  const repoPath = mkdtempSync(path.join(tmpdir(), 'devland-git-test-'));

  await execGit(repoPath, ['init']);
  await execGit(repoPath, ['config', 'user.name', 'Devland Test']);
  await execGit(repoPath, ['config', 'user.email', 'devland@example.com']);
  writeFileSync(path.join(repoPath, 'tracked.txt'), 'tracked\n', 'utf8');
  await execGit(repoPath, ['add', 'tracked.txt']);
  await execGit(repoPath, ['commit', '-m', 'Initial commit']);
  await execGit(repoPath, ['branch', '-M', 'main']);

  return repoPath;
}

describe('commitWorkingTreeSelection', () => {
  it('rejects partial commit payloads', async () => {
    const repoPath = mkdtempSync(path.join(tmpdir(), 'devland-git-test-'));

    try {
      await execGit(repoPath, ['init']);
      await execGit(repoPath, ['config', 'user.name', 'Devland Test']);
      await execGit(repoPath, ['config', 'user.email', 'devland@example.com']);

      const filePath = path.join(repoPath, 'example.ts');
      writeFileSync(filePath, 'const a = 1;\nconst b = 2;\nconst c = 3;\n', 'utf8');

      await execGit(repoPath, ['add', 'example.ts']);
      await execGit(repoPath, ['commit', '-m', 'Initial commit']);

      writeFileSync(filePath, 'const a = 1;\nconst b = 20;\nconst c = 30;\n', 'utf8');

      const diff = await getGitWorkingTreeDiff(repoPath);
      const file = parsePatchDocument(diff).files[0]!;

      await assert.rejects(
        commitWorkingTreeSelection({
          repoPath,
          summary: 'Commit selected changes',
          description: '',
          files: [
            {
              path: file.displayPath,
              paths: [file.displayPath],
              kind: 'partial',
              patch: file.rawPatch,
            },
          ],
        } as unknown as Parameters<typeof commitWorkingTreeSelection>[0]),
        /Unrecognized keys/,
      );
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('creates a whole-file commit when git uses mnemonic diff prefixes', async () => {
    const repoPath = mkdtempSync(path.join(tmpdir(), 'devland-git-test-'));

    try {
      await execGit(repoPath, ['init']);
      await execGit(repoPath, ['config', 'user.name', 'Devland Test']);
      await execGit(repoPath, ['config', 'user.email', 'devland@example.com']);
      await execGit(repoPath, ['config', 'diff.mnemonicPrefix', 'true']);

      const filePath = path.join(repoPath, 'example.ts');
      writeFileSync(filePath, 'const value = 1;\n', 'utf8');

      await execGit(repoPath, ['add', 'example.ts']);
      await execGit(repoPath, ['commit', '-m', 'Initial commit']);

      writeFileSync(filePath, 'const value = 2;\n', 'utf8');

      const diff = await getGitWorkingTreeDiff(repoPath);
      const file = parsePatchDocument(diff).files[0]!;
      const paths = [...new Set([file.oldPath, file.newPath].filter((value): value is string => value !== null))];

      assert.deepEqual(paths, ['example.ts']);

      const result = await commitWorkingTreeSelection({
        repoPath,
        summary: 'Commit selected file',
        description: '',
        files: [
          {
            path: file.displayPath,
            paths,
          },
        ],
      });

      assert.match(result.commitSha, /^[0-9a-f]{40}$/);
      assert.equal(
        (await execGit(repoPath, ['show', 'HEAD:example.ts'])).stdout,
        'const value = 2;\n',
      );

      const status = await getGitStatus(repoPath);
      assert.equal(status.files.length, 0);
      assert.equal(status.hasStagedChanges, false);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('creates a commit when other changes are already staged', async () => {
    const repoPath = mkdtempSync(path.join(tmpdir(), 'devland-git-test-'));

    try {
      await execGit(repoPath, ['init']);
      await execGit(repoPath, ['config', 'user.name', 'Devland Test']);
      await execGit(repoPath, ['config', 'user.email', 'devland@example.com']);

      writeFileSync(path.join(repoPath, 'a.txt'), 'a1\n', 'utf8');
      writeFileSync(path.join(repoPath, 'b.txt'), 'b1\n', 'utf8');
      await execGit(repoPath, ['add', '.']);
      await execGit(repoPath, ['commit', '-m', 'Initial commit']);

      writeFileSync(path.join(repoPath, 'a.txt'), 'a2\n', 'utf8');
      await execGit(repoPath, ['add', 'a.txt']);

      writeFileSync(path.join(repoPath, 'b.txt'), 'b2\n', 'utf8');

      const diff = await getGitWorkingTreeDiff(repoPath);
      const file = parsePatchDocument(diff).files.find((candidate) => candidate.displayPath === 'b.txt');

      assert.ok(file);

      const result = await commitWorkingTreeSelection({
        repoPath,
        summary: 'Commit selected file',
        description: '',
        files: [
          {
            path: file.displayPath,
            paths: [file.displayPath],
          },
        ],
      });

      assert.match(result.commitSha, /^[0-9a-f]{40}$/);
      assert.equal((await execGit(repoPath, ['show', 'HEAD:a.txt'])).stdout, 'a1\n');
      assert.equal((await execGit(repoPath, ['show', 'HEAD:b.txt'])).stdout, 'b2\n');

      const status = await getGitStatus(repoPath);
      assert.equal(status.hasStagedChanges, false);
      assert.deepEqual(
        status.files.map((fileStatus) => ({
          path: fileStatus.path,
          status: fileStatus.status,
          hasStagedChanges: fileStatus.hasStagedChanges,
          hasUnstagedChanges: fileStatus.hasUnstagedChanges,
        })),
        [
          {
            path: 'a.txt',
            status: 'modified',
            hasStagedChanges: false,
            hasUnstagedChanges: true,
          },
        ],
      );
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });
});

describe('getGitBranchHistory', () => {
  it('returns detached HEAD history without failing', async () => {
    const repoPath = mkdtempSync(path.join(tmpdir(), 'devland-git-test-'));

    try {
      await execGit(repoPath, ['init']);
      await execGit(repoPath, ['config', 'user.name', 'Devland Test']);
      await execGit(repoPath, ['config', 'user.email', 'devland@example.com']);

      writeFileSync(path.join(repoPath, 'example.ts'), 'const a = 1;\n', 'utf8');
      await execGit(repoPath, ['add', 'example.ts']);
      await execGit(repoPath, ['commit', '-m', 'Initial commit']);
      await execGit(repoPath, ['checkout', '--detach', 'HEAD']);

      const history = await getGitBranchHistory(repoPath, 'HEAD');

      assert.equal(history.branch, 'HEAD');
      assert.equal(history.commits.length, 1);
      assert.equal(history.commits[0]?.title, 'Initial commit');
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('limits branch history to the most recent 30 commits', async () => {
    const repoPath = mkdtempSync(path.join(tmpdir(), 'devland-git-test-'));

    try {
      await execGit(repoPath, ['init']);
      await execGit(repoPath, ['config', 'user.name', 'Devland Test']);
      await execGit(repoPath, ['config', 'user.email', 'devland@example.com']);

      const filePath = path.join(repoPath, 'example.ts');

      for (let commitNumber = 1; commitNumber <= 35; commitNumber += 1) {
        writeFileSync(filePath, `export const value = ${commitNumber};\n`, 'utf8');
        await execGit(repoPath, ['add', 'example.ts']);
        await execGit(repoPath, ['commit', '-m', `Commit ${commitNumber}`]);
      }

      const history = await getGitBranchHistory(repoPath, 'HEAD');

      assert.equal(history.commits.length, 30);
      assert.equal(history.commits[0]?.title, 'Commit 35');
      assert.equal(history.commits.at(-1)?.title, 'Commit 6');
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });
});

describe('getGitStatus', () => {
  it('enumerates untracked files inside directories', async () => {
    const repoPath = mkdtempSync(path.join(tmpdir(), 'devland-git-test-'));

    try {
      await execGit(repoPath, ['init']);
      await execGit(repoPath, ['config', 'user.name', 'Devland Test']);
      await execGit(repoPath, ['config', 'user.email', 'devland@example.com']);

      writeFileSync(path.join(repoPath, 'tracked.txt'), 'tracked\n', 'utf8');
      await execGit(repoPath, ['add', 'tracked.txt']);
      await execGit(repoPath, ['commit', '-m', 'Initial commit']);

      const outputDir = path.join(repoPath, 'dist', 'assets');
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(path.join(repoPath, 'dist', 'index.html'), '<html></html>\n', { encoding: 'utf8', flag: 'w' });
      writeFileSync(path.join(outputDir, 'bundle.js'), 'console.log("hi");\n', { encoding: 'utf8', flag: 'w' });

      const status = await getGitStatus(repoPath);

      assert.deepEqual(
        status.files.map((fileStatus) => fileStatus.path).sort(),
        ['dist/assets/bundle.js', 'dist/index.html'],
      );

      const diff = await getGitWorkingTreeDiff(repoPath);
      const diffPaths = parsePatchDocument(diff).files.map((file) => file.displayPath).sort();

      assert.deepEqual(diffPaths, ['dist/assets/bundle.js', 'dist/index.html']);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });
});

describe('writeGitPromptRequestNote', () => {
  it('stores prompt request image assets when the asset ref does not exist yet', async () => {
    const repoPath = await createCommittedRepo();

    try {
      const commitSha = (await execGit(repoPath, ['rev-parse', 'HEAD'])).stdout.trim();
      const imageBytes = Buffer.from('fake image bytes', 'utf8');

      await writeGitPromptRequestNote({
        repoPath,
        commitSha,
        snapshot: {
          version: 2,
          threadId: 'thread-1',
          branchName: 'main',
          createdAt: '2026-03-23T00:00:00.000Z',
          settings: {
            model: 'gpt-5',
            reasoningEffort: 'medium',
          },
          checkpoint: {
            transcriptEntryStart: 0,
            transcriptEntryEnd: 1,
          },
          transcriptEntries: [
            {
              id: 'entry-1',
              kind: 'message',
              message: {
                id: 'message-1',
                role: 'user',
                text: 'Investigate this screenshot.',
                attachments: [
                  {
                    type: 'image',
                    name: 'screenshot.png',
                    mimeType: 'image/png',
                    sizeBytes: imageBytes.length,
                    previewUrl: `data:image/png;base64,${imageBytes.toString('base64')}`,
                    asset: null,
                  },
                ],
                createdAt: '2026-03-23T00:00:00.000Z',
                completedAt: null,
                turnId: null,
                itemId: null,
              },
            },
          ],
        },
      });

      const { stdout: noteStdout } = await execGit(repoPath, [
        'notes',
        '--ref=devland-prompt-requests',
        'show',
        commitSha,
      ]);
      const note = JSON.parse(noteStdout);
      const attachment = note.transcriptEntries[0]?.message.attachments[0];

      assert.equal(attachment.previewUrl, null);
      assert.equal(attachment.asset?.ref, GIT_PROMPT_REQUEST_ASSETS_REF);
      assert.match(attachment.asset?.path ?? '', /^images\/[a-f0-9]{2}\/[a-f0-9]{64}\.png$/);

      const { stdout: storedAssetStdout } = await execGit(repoPath, [
        'show',
        `${GIT_PROMPT_REQUEST_ASSETS_REF}:${attachment.asset.path}`,
      ]);

      assert.equal(storedAssetStdout, imageBytes.toString('utf8'));
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });
});

describe('createGitWorktree', () => {
  it('creates a detached worktree from the repo default branch without creating a branch ref', async () => {
    const repoPath = await createCommittedRepo();

    try {
      const result = await createGitWorktree(repoPath);
      const worktreeStatus = await getGitStatus(result.cwd);
      const branches = (await execGit(repoPath, ['branch', '--format=%(refname:short)'])).stdout
        .trim()
        .split('\n')
        .filter(Boolean);

      assert.equal(result.initialTitle, '<branch name tbd>');
      assert.equal(worktreeStatus.branch, 'HEAD');
      assert.deepEqual(branches, ['main']);

      await removeGitWorktree(repoPath, result.cwd, true);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('uses origin HEAD when the default branch is not main or master', async () => {
    const repoPath = mkdtempSync(path.join(tmpdir(), 'devland-git-test-'));
    const remotePath = mkdtempSync(path.join(tmpdir(), 'devland-git-remote-test-'));

    try {
      await execGit(remotePath, ['init', '--bare']);
      await execGit(repoPath, ['init']);
      await execGit(repoPath, ['config', 'user.name', 'Devland Test']);
      await execGit(repoPath, ['config', 'user.email', 'devland@example.com']);

      writeFileSync(path.join(repoPath, 'tracked.txt'), 'tracked\n', 'utf8');
      await execGit(repoPath, ['add', 'tracked.txt']);
      await execGit(repoPath, ['commit', '-m', 'Initial commit']);
      await execGit(repoPath, ['branch', '-M', 'trunk']);
      await execGit(repoPath, ['remote', 'add', 'origin', remotePath]);
      await execGit(repoPath, ['push', '-u', 'origin', 'trunk']);
      await execGit(remotePath, ['symbolic-ref', 'HEAD', 'refs/heads/trunk']);
      await execGit(repoPath, ['remote', 'set-head', 'origin', '-a']);

      assert.equal(await getGitDefaultBranch(repoPath), 'trunk');

      const result = await createGitWorktree(repoPath);
      const worktreeStatus = await getGitStatus(result.cwd);

      assert.equal(worktreeStatus.branch, 'HEAD');
      assert.equal(
        (await execGit(result.cwd, ['rev-parse', 'HEAD'])).stdout.trim(),
        (await execGit(repoPath, ['rev-parse', 'trunk'])).stdout.trim(),
      );

      await removeGitWorktree(repoPath, result.cwd, true);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
      rmSync(remotePath, { recursive: true, force: true });
    }
  });
});

describe('checkGitWorktreeRemoval', () => {
  it('reports a clean detached worktree as safe', async () => {
    const repoPath = await createCommittedRepo();
    const worktreePath = path.join(repoPath, '..', 'worktree-clean');

    try {
      await execGit(repoPath, ['worktree', 'add', '--detach', worktreePath, 'main']);

      const result = await checkGitWorktreeRemoval(worktreePath);

      assert.deepEqual(result, { status: 'safe' });
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });

  it('removes a clean detached worktree', async () => {
    const repoPath = await createCommittedRepo();
    const worktreePath = path.join(repoPath, '..', 'worktree-clean');

    try {
      await execGit(repoPath, ['worktree', 'add', '--detach', worktreePath, 'main']);

      await removeGitWorktree(repoPath, worktreePath);
      assert.equal(existsSync(worktreePath), false);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });

  it('requires confirmation before removing a dirty detached worktree', async () => {
    const repoPath = await createCommittedRepo();
    const worktreePath = path.join(repoPath, '..', 'worktree-dirty');

    try {
      await execGit(repoPath, ['worktree', 'add', '--detach', worktreePath, 'main']);
      writeFileSync(path.join(worktreePath, 'tracked.txt'), 'changed\n', 'utf8');

      const preflight = await checkGitWorktreeRemoval(worktreePath);

      assert.deepEqual(preflight, {
        status: 'confirmation-required',
        reasons: ['dirty'],
      });

      await removeGitWorktree(repoPath, worktreePath, true);
      assert.equal(existsSync(worktreePath), false);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });

  it('requires confirmation before removing detached commits that are not on any branch', async () => {
    const repoPath = await createCommittedRepo();
    const worktreePath = path.join(repoPath, '..', 'worktree-detached-commit');

    try {
      await execGit(repoPath, ['worktree', 'add', '--detach', worktreePath, 'main']);
      writeFileSync(path.join(worktreePath, 'tracked.txt'), 'tracked\nnext\n', 'utf8');
      await execGit(worktreePath, ['commit', '-am', 'Detached commit']);

      const preflight = await checkGitWorktreeRemoval(worktreePath);

      assert.deepEqual(preflight, {
        status: 'confirmation-required',
        reasons: ['unreferenced-detached-head'],
      });

      await removeGitWorktree(repoPath, worktreePath, true);
      assert.equal(existsSync(worktreePath), false);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
      rmSync(worktreePath, { recursive: true, force: true });
    }
  });
});
