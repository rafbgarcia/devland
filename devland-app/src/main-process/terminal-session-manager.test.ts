import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { IPty } from 'node-pty';

import { TerminalSessionManager } from '@/main-process/terminal-session-manager';

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

describe('TerminalSessionManager', () => {
  it('starts a background terminal session and executes a command before the terminal is opened', async () => {
    const children: FakePty[] = [];
    const manager = new TerminalSessionManager(((file, args, options) => {
      const child = new FakePty();
      children.push(child);
      return child as unknown as IPty;
    }) as typeof import('node-pty').spawn);

    await manager.exec({
      sessionId: 'worktree-1',
      cwd: '/repo/worktree',
      command: 'bun run setup-worktree',
    });

    children[0]?.emitData('setting up...\r\n');

    const snapshot = await manager.open({
      sessionId: 'worktree-1',
      cwd: '/repo/worktree',
    });

    assert.equal(children.length, 1);
    assert.deepEqual(children[0]?.writes, ['bun run setup-worktree\r']);
    assert.equal(snapshot.status, 'running');
    assert.equal(snapshot.history, 'setting up...\r\n');
  });

  it('rejects exec when the terminal process fails to start', async () => {
    const manager = new TerminalSessionManager((() => {
      throw new Error('spawn failed');
    }) as typeof import('node-pty').spawn);

    await assert.rejects(
      () =>
        manager.exec({
          sessionId: 'worktree-2',
          cwd: '/repo/worktree',
          command: './bin/setup-worktree.sh',
        }),
      /spawn failed/,
    );
  });
});
