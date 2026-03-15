import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';

import {
  DiffSelection,
  formatPatchFromSelection,
  getSelectableDiffLineNumbers,
  parseUnifiedDiffDocument,
} from '@/lib/diff';
import {
  commitWorkingTreeSelection,
  getGitBranchHistory,
  getGitStatus,
  getGitWorkingTreeDiff,
} from '@/main-process/git';

const execFileAsync = promisify(execFile);

async function execGit(cwd: string, args: string[]) {
  return execFileAsync('git', ['-C', cwd, ...args], {
    timeout: 15000,
    windowsHide: true,
  });
}

describe('commitWorkingTreeSelection', () => {
  it('creates a partial commit while leaving unselected changes in the working tree', async () => {
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
      const file = parseUnifiedDiffDocument(diff).files[0]!;
      const selectableLines = getSelectableDiffLineNumbers(file);
      const patch = formatPatchFromSelection(
        file,
        DiffSelection.all(selectableLines).withLineSelection(4, false).withLineSelection(6, false),
      );

      assert.ok(patch);

      const result = await commitWorkingTreeSelection({
        repoPath,
        summary: 'Commit selected changes',
        description: '',
        files: [
          {
            path: file.displayPath,
            paths: [file.displayPath],
            kind: 'partial',
            patch,
          },
        ],
      });

      assert.match(result.commitSha, /^[0-9a-f]{40}$/);

      const headFile = (await execGit(repoPath, ['show', 'HEAD:example.ts'])).stdout;
      assert.equal(headFile, 'const a = 1;\nconst b = 20;\nconst c = 3;\n');
      assert.equal(
        readFileSync(filePath, 'utf8'),
        'const a = 1;\nconst b = 20;\nconst c = 30;\n',
      );

      const status = await getGitStatus(repoPath);
      assert.equal(status.hasStagedChanges, false);
      assert.match(status.headRevision ?? '', /^[0-9a-f]{40}$/);
      assert.deepEqual(
        status.files.map((fileStatus) => ({
          path: fileStatus.path,
          status: fileStatus.status,
          hasStagedChanges: fileStatus.hasStagedChanges,
          hasUnstagedChanges: fileStatus.hasUnstagedChanges,
        })),
        [
          {
            path: 'example.ts',
            status: 'modified',
            hasStagedChanges: false,
            hasUnstagedChanges: true,
          },
        ],
      );

      const remainingDiff = await getGitWorkingTreeDiff(repoPath);
      assert.match(remainingDiff, /const c = 3;/);
      assert.match(remainingDiff, /const c = 30;/);
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
      const file = parseUnifiedDiffDocument(diff).files[0]!;
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
            kind: 'full',
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
});
