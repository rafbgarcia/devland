import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { IPty } from 'node-pty';

import {
  resolveTerminalShellCommand,
  TerminalSessionManager,
} from '@/main-process/terminal-session-manager';

class FakePty {
  readonly pid = 12_345;
  readonly writes: string[] = [];
  readonly resizes: Array<{ cols: number; rows: number }> = [];
  killed = false;
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];

  onData(listener: (data: string) => void) {
    this.dataListeners.push(listener);

    return {
      dispose: () => {
        this.dataListeners = this.dataListeners.filter((candidate) => candidate !== listener);
      },
    };
  }

  onExit(listener: (event: { exitCode: number; signal?: number }) => void) {
    this.exitListeners.push(listener);

    return {
      dispose: () => {
        this.exitListeners = this.exitListeners.filter((candidate) => candidate !== listener);
      },
    };
  }

  write(data: string): void {
    this.writes.push(data);
  }

  resize(cols: number, rows: number): void {
    this.resizes.push({ cols, rows });
  }

  kill(): void {
    this.killed = true;
  }

  emitData(data: string): void {
    for (const listener of this.dataListeners) {
      listener(data);
    }
  }

  emitExit(event: { exitCode: number; signal?: number }): void {
    for (const listener of this.exitListeners) {
      listener(event);
    }
  }
}

const createTempDirectory = (): string =>
  mkdtempSync(path.join(tmpdir(), 'devland-terminal-test-'));

describe('TerminalSessionManager', () => {
  it('prefers a valid fallback shell when SHELL is invalid', () => {
    const resolved = resolveTerminalShellCommand({
      env: { SHELL: '/definitely/missing/shell' },
      platform: 'darwin',
      userShell: null,
      isExecutable: (filePath) => filePath === '/bin/zsh',
    });

    assert.equal(resolved, '/bin/zsh');
  });

  it('starts a background terminal session and executes a command before the terminal is opened', async () => {
    const children: FakePty[] = [];
    const cwd = createTempDirectory();
    const manager = new TerminalSessionManager((() => {
      const child = new FakePty();
      children.push(child);
      return child as unknown as IPty;
    }) as typeof import('node-pty').spawn);

    await manager.exec({
      sessionId: 'worktree-1',
      cwd,
      command: 'bun run setup-worktree',
    });

    children[0]?.emitData('setting up...\r\n');

    const snapshot = await manager.open({
      sessionId: 'worktree-1',
      cwd,
    });

    assert.equal(children.length, 1);
    assert.deepEqual(children[0]?.writes, ['bun run setup-worktree\r']);
    assert.equal(snapshot.status, 'running');
    assert.equal(snapshot.history, 'setting up...\r\n');
  });

  it('surfaces a clear error when the terminal working directory is missing', async () => {
    const tempRoot = createTempDirectory();
    const missingCwd = path.join(tempRoot, 'missing');
    const manager = new TerminalSessionManager((() => {
      throw new Error('spawn should not be called');
    }) as typeof import('node-pty').spawn);

    const snapshot = await manager.open({
      sessionId: 'missing-cwd',
      cwd: missingCwd,
    });

    assert.equal(snapshot.status, 'error');
    assert.match(
      snapshot.error ?? '',
      new RegExp(`Terminal working directory does not exist: ${missingCwd}`),
    );
  });

  it('rejects exec when the terminal process fails to start', async () => {
    const cwd = createTempDirectory();
    const manager = new TerminalSessionManager((() => {
      throw new Error('spawn failed');
    }) as typeof import('node-pty').spawn);

    await assert.rejects(
      () =>
        manager.exec({
          sessionId: 'worktree-2',
          cwd,
          command: './bin/setup-worktree.sh',
        }),
      /spawn failed/,
    );
  });
});
