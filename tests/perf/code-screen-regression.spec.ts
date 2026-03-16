import { execFile } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

import type { DevPerformanceCounters } from '@/renderer/shared/lib/dev-performance';

const execFileAsync = promisify(execFile);

async function execGit(cwd: string, args: string[]) {
  return execFileAsync('git', ['-C', cwd, ...args], {
    timeout: 20_000,
    windowsHide: true,
  });
}

async function createPerfFixtureRepo(): Promise<string> {
  const remoteRepoPath = mkdtempSync(path.join(tmpdir(), 'devland-perf-remote-'));
  const repoPath = mkdtempSync(path.join(tmpdir(), 'devland-perf-repo-'));

  await execGit(remoteRepoPath, ['init', '--bare', '--initial-branch=main']);
  await execGit(path.dirname(repoPath), ['clone', remoteRepoPath, repoPath]);
  await execGit(repoPath, ['config', 'user.name', 'Devland Perf']);
  await execGit(repoPath, ['config', 'user.email', 'devland-perf@example.com']);

  writeFileSync(path.join(repoPath, 'README.md'), '# Devland Perf Fixture\n', 'utf8');
  writeFileSync(
    path.join(repoPath, 'example.ts'),
    'export const greeting = "hello";\nexport const target = "world";\n',
    'utf8',
  );
  await execGit(repoPath, ['add', '.']);
  await execGit(repoPath, ['commit', '-m', 'Initial commit']);
  await execGit(repoPath, ['push', '-u', 'origin', 'main']);

  writeFileSync(
    path.join(repoPath, 'example.ts'),
    'export const greeting = "hello";\nexport const target = "perf regression";\n',
    'utf8',
  );
  writeFileSync(path.join(repoPath, 'notes.md'), 'Pending work.\n', 'utf8');

  return realpathSync(repoPath);
}

async function bootstrapRepoState(page: Page, repoPath: string) {
  const addFirstProjectButton = page.getByRole('button', { name: 'Add your first project' });

  if (await addFirstProjectButton.isVisible().catch(() => false)) {
    await addFirstProjectButton.click();
  }

  await page
    .getByLabel('Absolute path or GitHub owner/repository')
    .fill(repoPath);
  await page.getByRole('button', { name: 'Add project' }).click();
  await page.getByRole('button', { name: 'Codex' }).waitFor();
  await page.getByPlaceholder(/Message Codex about/i).waitFor();
}

async function resetDiagnostics(page: Page) {
  await page.waitForFunction(() => Boolean(window.__DEVLAND_PERF_DIAGNOSTICS__));
  await page.evaluate(() => {
    window.__DEVLAND_PERF_DIAGNOSTICS__?.reset();
  });
}

async function getDiagnosticsSnapshot(
  page: Page,
): Promise<DevPerformanceCounters> {
  return page.evaluate(() => {
    const snapshot = window.__DEVLAND_PERF_DIAGNOSTICS__?.snapshot();

    if (!snapshot) {
      throw new Error('Perf diagnostics are not available in the renderer.');
    }

    return snapshot;
  });
}

test.describe('code screen perf regression guards', () => {
  test('typing in codex and commit inputs does not trigger runaway background work', async () => {
    const repoPath = await createPerfFixtureRepo();
    const userDataDir = mkdtempSync(path.join(tmpdir(), 'devland-perf-user-data-'));
    const electronModule = await import('electron');
    const electronBinaryPath = (electronModule.default ?? electronModule) as unknown as string;
    const appEntryPath = path.resolve(
      process.env.DEVLAND_E2E_APP_ENTRY?.trim() || '.vite/build/main.js',
    );

    const electronApp: ElectronApplication = await electron.launch({
      executablePath: electronBinaryPath,
      args: [appEntryPath],
      env: {
        ...process.env,
        DEVLAND_TEST_MODE: '1',
        DEVLAND_TEST_USER_DATA_DIR: userDataDir,
      },
    });

    try {
      const page = await electronApp.firstWindow();

      await bootstrapRepoState(page, repoPath);

      await page.waitForTimeout(1_500);
      await resetDiagnostics(page);

      const codexInput = page.getByPlaceholder(/Message Codex about/i);
      await codexInput.fill('Investigate renderer perf regressions without making code changes yet.');
      await page.waitForTimeout(2_500);

      const codexSnapshot = await getDiagnosticsSnapshot(page);
      expect(codexSnapshot.gitStatusFetchStarted).toBeLessThanOrEqual(1);
      expect(codexSnapshot.gitStatusFetchCompleted).toBe(codexSnapshot.gitStatusFetchStarted);
      expect(codexSnapshot.gitDefaultBranchFetchStarted).toBeLessThanOrEqual(1);
      expect(codexSnapshot.gitDefaultBranchFetchCompleted).toBe(codexSnapshot.gitDefaultBranchFetchStarted);
      expect(codexSnapshot.gitBranchesFetchStarted).toBe(0);
      expect(codexSnapshot.diffRenderBuilds).toBe(0);
      expect(codexSnapshot.diffSyntaxEffectRuns).toBe(0);

      await page.getByRole('button', { name: 'Changes', exact: true }).click();
      await page.getByPlaceholder('Commit summary').waitFor();
      await page.waitForTimeout(1_500);
      await resetDiagnostics(page);

      await page.getByPlaceholder('Commit summary').fill('Tighten renderer perf regression coverage');
      await page.getByPlaceholder('Description (optional)').fill(
        'Keep the common CI path fast and move heavier perf checks into a separate workflow.',
      );
      await page.waitForTimeout(3_000);

      const commitSnapshot = await getDiagnosticsSnapshot(page);
      expect(commitSnapshot.gitStatusFetchStarted).toBeLessThanOrEqual(1);
      expect(commitSnapshot.gitStatusFetchCompleted).toBe(commitSnapshot.gitStatusFetchStarted);
      expect(commitSnapshot.gitDefaultBranchFetchStarted).toBeLessThanOrEqual(1);
      expect(commitSnapshot.gitDefaultBranchFetchCompleted).toBe(commitSnapshot.gitDefaultBranchFetchStarted);
      expect(commitSnapshot.gitBranchesFetchStarted).toBe(0);
      expect(commitSnapshot.gitWatchEventsReceived).toBe(0);
      expect(commitSnapshot.diffRenderBuilds).toBeLessThanOrEqual(1);
      expect(commitSnapshot.diffSyntaxEffectRuns).toBeLessThanOrEqual(1);
    } finally {
      await electronApp.close();
      rmSync(userDataDir, { recursive: true, force: true });
      rmSync(repoPath, { recursive: true, force: true });
    }
  });
});
