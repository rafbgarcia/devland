import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

const execFileAsync = promisify(execFile);

async function execGit(cwd: string, args: string[]) {
  return execFileAsync('git', ['-C', cwd, ...args], {
    timeout: 20_000,
    windowsHide: true,
  });
}

async function createFixtureRepo(): Promise<string> {
  const remoteRepoPath = mkdtempSync(path.join(tmpdir(), 'devland-browser-remote-'));
  const repoPath = mkdtempSync(path.join(tmpdir(), 'devland-browser-repo-'));

  await execGit(remoteRepoPath, ['init', '--bare', '--initial-branch=main']);
  await execGit(path.dirname(repoPath), ['clone', remoteRepoPath, repoPath]);
  await execGit(repoPath, ['config', 'user.name', 'Devland Browser Smoke']);
  await execGit(repoPath, ['config', 'user.email', 'devland-browser@example.com']);

  writeFileSync(path.join(repoPath, 'README.md'), '# Browser Smoke Fixture\n', 'utf8');
  await execGit(repoPath, ['add', '.']);
  await execGit(repoPath, ['commit', '-m', 'Initial commit']);
  await execGit(repoPath, ['push', '-u', 'origin', 'main']);

  return realpathSync(repoPath);
}

async function bootstrapRepoState(page: Page, repoPath: string) {
  const composer = page.getByLabel('Message Codex', { exact: true });

  if (await composer.isVisible().catch(() => false)) {
    return;
  }

  await page.getByRole('button', { name: 'Add project', exact: true }).first().click();
  await page.getByRole('heading', { name: 'Add a Git repo', exact: true }).waitFor();
  await page.getByLabel('Project path', { exact: true }).fill(repoPath);
  await page.getByRole('button', { name: 'Add project' }).click();
  await composer.waitFor();
}

async function openCodexMenu(page: Page) {
  await page.getByLabel('Codex menu').click();
}

async function setBrowserControl(page: Page, enabled: boolean) {
  await openCodexMenu(page);
  await page
    .locator('[data-slot="dropdown-menu-submenu-trigger"]')
    .filter({ hasText: 'Browser control' })
    .hover();
  await page
    .getByRole('menuitemradio', { name: enabled ? 'On' : 'Off', exact: true })
    .click();
}

async function sendPrompt(page: Page, prompt: string) {
  const composer = page.getByLabel('Message Codex', { exact: true });

  await composer.fill(prompt);
  await composer.press('Enter');
}

async function waitForAddressValue(page: Page, expectedUrl: string) {
  await page.getByRole('button', { name: 'Browser', exact: true }).click();

  const addressInput = page.getByLabel('Browser address');
  await expect(addressInput).toHaveValue(expectedUrl, { timeout: 20_000 });
}

async function createActiveBrowserTab(page: Page) {
  await page.getByRole('button', { name: 'Browser', exact: true }).click();
  await page.getByRole('button', { name: 'New browser tab', exact: true }).click();
}

async function createSmokeServer(): Promise<{
  server: Server;
  url: string;
  getHits: () => string[];
}> {
  const hits: string[] = [];
  const server = createServer((request, response) => {
    hits.push(request.url ?? '/');
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Browser Smoke</title>
    <style>
      body {
        font-family: sans-serif;
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f5efe5;
        color: #1d1d1d;
      }
      main {
        width: min(28rem, calc(100vw - 2rem));
        padding: 1.5rem;
        border-radius: 1rem;
        background: white;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.08);
      }
      label,
      input,
      button {
        display: block;
        width: 100%;
      }
      input,
      button {
        margin-top: 0.75rem;
        font-size: 1rem;
        padding: 0.75rem 0.875rem;
        border-radius: 0.75rem;
      }
      input {
        border: 1px solid #d7d0c5;
      }
      button {
        border: 0;
        background: #1f6feb;
        color: white;
        font-weight: 600;
      }
      #status {
        margin-top: 1rem;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Browser Smoke</h1>
      <label for="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        placeholder="Email address"
        autocomplete="off"
      />
      <button
        id="continue"
        type="button"
        onclick="document.getElementById('status').textContent = 'Submitted ' + document.getElementById('email').value"
      >
        Continue
      </button>
      <p id="status">Idle</p>
    </main>
  </body>
</html>`);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Smoke server did not bind a TCP port.');
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}/smoke`,
    getHits: () => [...hits],
  };
}

function createFakeCodexBinary(tempDir: string): string {
  const binaryPath = path.join(tempDir, 'codex');
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const readline = require('node:readline');

if (process.argv[2] !== 'app-server') {
  process.stderr.write('Unsupported invocation\\n');
  process.exit(1);
}

const logPath = process.env.DEVLAND_BROWSER_TEST_LOG;

function appendLog(entry) {
  if (!logPath) return;
  fs.appendFileSync(logPath, JSON.stringify(entry) + '\\n', 'utf8');
}

function respond(id, result) {
  process.stdout.write(JSON.stringify({ id, result }) + '\\n');
}

function notify(method, params) {
  process.stdout.write(JSON.stringify({ method, params }) + '\\n');
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readFileSize(filePath) {
  if (!filePath) return null;
  try {
    return fs.statSync(filePath).size;
  } catch {
    return null;
  }
}

function runBrowserCommand(browserCli, args) {
  const result = spawnSync(browserCli, args, {
    env: process.env,
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    json: parseJson(result.stdout),
  };
}

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line);

  if (message.method === 'initialized') {
    return;
  }

  if (message.method === 'initialize') {
    respond(message.id, { ok: true });
    return;
  }

  if (message.method === 'thread/start' || message.method === 'thread/resume') {
    respond(message.id, {
      thread: {
        id: 'fake-thread-1',
        createdAt: 1,
        updatedAt: 1,
        turns: [],
      },
    });
    notify('thread/started', { thread: { id: 'fake-thread-1' } });
    return;
  }

  if (message.method === 'turn/start') {
    const instructions =
      message.params?.collaborationMode?.settings?.developer_instructions ?? '';
    const browserCli = process.env.DEVLAND_BROWSER_CLI || '';
    const browserUrl = process.env.DEVLAND_BROWSER_CONTROL_SMOKE_URL || '';

    appendLog({
      type: 'turn-start',
      browserCliPresent: browserCli.length > 0,
      instructionMentionsBrowser: instructions.includes('DEVLAND_BROWSER_CLI'),
      instructionMentionsInspect: instructions.includes('inspect [selector]'),
      browserUrl,
    });

    let assistantDelta = browserCli ? 'Browser control active.' : 'Browser control disabled.';

    if (browserCli && browserUrl) {
      const navigation = runBrowserCommand(browserCli, ['navigate', browserUrl]);
      const inspect = runBrowserCommand(browserCli, ['inspect']);
      const type = runBrowserCommand(browserCli, [
        'type',
        'input[name="email"]',
        'qa@example.com',
      ]);
      const click = runBrowserCommand(browserCli, ['click', 'button#continue']);
      const status = runBrowserCommand(browserCli, ['inspect', '#status']);
      const screenshot = runBrowserCommand(browserCli, [
        'screenshot',
        'Browser smoke screenshot',
      ]);

      appendLog({
        type: 'browser-run',
        navigationStatus: navigation.status,
        currentUrl: navigation.json?.currentUrl ?? null,
        inspectedElementCount: inspect.json?.elements?.length ?? 0,
        typedValue: type.json?.element?.value ?? null,
        clickedSelector: click.json?.element?.selector ?? null,
        statusText: status.json?.element?.text ?? null,
        screenshotMarkdown: screenshot.json?.markdown ?? null,
        screenshotPath: screenshot.json?.path ?? null,
        screenshotSizeBytes: readFileSize(screenshot.json?.path ?? null),
      });

      if (typeof screenshot.json?.markdown === 'string' && screenshot.json.markdown.length > 0) {
        assistantDelta = 'Browser control active.\\n\\n' + screenshot.json.markdown;
      }
    }

    respond(message.id, { turn: { id: 'fake-turn-1' } });
    notify('turn/started', { turn: { id: 'fake-turn-1' } });
    notify('item/agentMessage/delta', {
      itemId: 'fake-assistant-1',
      delta: assistantDelta,
    });
    notify('turn/completed', {
      turn: {
        id: 'fake-turn-1',
        status: 'completed',
      },
    });
    return;
  }

  if (message.method === 'turn/interrupt') {
    respond(message.id, { ok: true });
    return;
  }

  respond(message.id, { ok: true });
});
`;

  writeFileSync(binaryPath, script, { encoding: 'utf8', mode: 0o755 });

  return binaryPath;
}

function readFakeCodexLog(logPath: string) {
  try {
    const raw = readFileSync(logPath, 'utf8').trim();
    return raw.length === 0
      ? []
      : raw.split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
  } catch {
    return [];
  }
}

async function expectAssistantText(page: Page, text: string | RegExp) {
  await expect(page.getByText(text)).toBeVisible({ timeout: 20_000 });
}

test.describe('Codex browser control smoke', () => {
  test('gates browser control per repo and navigates through the live Electron app', async () => {
    const repoPath = await createFixtureRepo();
    const userDataDir = mkdtempSync(path.join(tmpdir(), 'devland-browser-user-data-'));
    const fakeCodexDir = mkdtempSync(path.join(tmpdir(), 'devland-fake-codex-'));
    const fakeCodexLogPath = path.join(fakeCodexDir, 'codex-log.jsonl');
    const smokeServer = await createSmokeServer();
    createFakeCodexBinary(fakeCodexDir);
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
        DEVLAND_BROWSER_CONTROL_SMOKE_URL: smokeServer.url,
        DEVLAND_BROWSER_TEST_LOG: fakeCodexLogPath,
        PATH: `${fakeCodexDir}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    });

    try {
      const page = await electronApp.firstWindow();

      await bootstrapRepoState(page, repoPath);

      await sendPrompt(page, 'Try browser control while disabled.');
      await expectAssistantText(page, /Browser control disabled\./);

      let logEntries = readFakeCodexLog(fakeCodexLogPath).filter(
        (entry) => entry.type === 'turn-start',
      );
      expect(logEntries.length).toBeGreaterThanOrEqual(1);
      expect(logEntries[0]?.browserCliPresent).toBe(false);
      expect(logEntries[0]?.instructionMentionsBrowser).toBe(false);
      expect(smokeServer.getHits()).toHaveLength(0);

      await createActiveBrowserTab(page);

      await setBrowserControl(page, true);
      await sendPrompt(page, 'Use the browser helper to open the smoke page.');
      await expectAssistantText(page, /Browser control active\./);
      await waitForAddressValue(page, smokeServer.url);

      logEntries = readFakeCodexLog(fakeCodexLogPath).filter(
        (entry) => entry.type === 'turn-start',
      );
      expect(logEntries.length).toBeGreaterThanOrEqual(2);
      expect(logEntries[1]?.browserCliPresent).toBe(true);
      expect(logEntries[1]?.instructionMentionsBrowser).toBe(true);
      expect(logEntries[1]?.instructionMentionsInspect).toBe(true);
      expect(smokeServer.getHits()).toContain('/smoke');

      const interactionLog = readFakeCodexLog(fakeCodexLogPath).find(
        (entry) => entry.type === 'browser-run',
      );
      expect(interactionLog?.navigationStatus).toBe(0);
      expect(interactionLog?.currentUrl).toBe(smokeServer.url);
      expect(interactionLog?.typedValue).toBe('qa@example.com');
      expect(interactionLog?.clickedSelector).toBe('button#continue');
      expect(interactionLog?.statusText).toBe('Submitted qa@example.com');
      expect(interactionLog?.inspectedElementCount).toBeGreaterThan(0);
      expect(interactionLog?.screenshotMarkdown).toMatch(
        /^!\[Browser smoke screenshot\]\(devland-codex-attachment:\/\/asset\//,
      );
      expect(interactionLog?.screenshotSizeBytes).toBeGreaterThan(0);
      await expect(page.getByAltText('Browser smoke screenshot')).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await electronApp.close();
      await new Promise<void>((resolve, reject) => {
        smokeServer.server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      rmSync(userDataDir, { recursive: true, force: true });
      rmSync(fakeCodexDir, { recursive: true, force: true });
      rmSync(repoPath, { recursive: true, force: true });
    }
  });
});
