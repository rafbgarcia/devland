import { EventEmitter } from 'node:events';

import { spawn as spawnPty, type IPty } from 'node-pty';

import type {
  OpenTerminalSessionInput,
  ResizeTerminalSessionInput,
  TerminalSessionEvent,
  TerminalSessionSnapshot,
  TerminalSessionStatus,
  WriteTerminalSessionInput,
} from '@/ipc/contracts';

const DEFAULT_TERMINAL_COLS = 120;
const DEFAULT_TERMINAL_ROWS = 32;
const MAX_TERMINAL_HISTORY_CHARS = 200_000;
const DEFAULT_UNIX_SHELL = process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';

type TerminalSession = {
  sessionId: string;
  cwd: string;
  cols: number;
  rows: number;
  status: TerminalSessionStatus;
  child: IPty | null;
  pid: number | null;
  history: string;
  exitCode: number | null;
  exitSignal: number | null;
  error: string | null;
  updatedAt: string;
};

const nowIso = () => new Date().toISOString();

const pruneTerminalHistory = (history: string): string =>
  history.length > MAX_TERMINAL_HISTORY_CHARS
    ? history.slice(-MAX_TERMINAL_HISTORY_CHARS)
    : history;

const createSnapshot = (session: TerminalSession): TerminalSessionSnapshot => ({
  sessionId: session.sessionId,
  cwd: session.cwd,
  status: session.status,
  pid: session.pid,
  history: session.history,
  exitCode: session.exitCode,
  exitSignal: session.exitSignal,
  error: session.error,
  updatedAt: session.updatedAt,
});

const resolveShellCommand = (): string => {
  const shell = process.env.SHELL?.trim();

  if (shell) {
    return shell;
  }

  if (process.platform === 'win32') {
    return process.env.ComSpec?.trim() || 'powershell.exe';
  }

  return DEFAULT_UNIX_SHELL;
};

export class TerminalSessionManager extends EventEmitter<{
  event: [TerminalSessionEvent];
}> {
  private readonly sessions = new Map<string, TerminalSession>();

  async open(input: OpenTerminalSessionInput): Promise<TerminalSessionSnapshot> {
    const session = this.ensureSession(input);
    const nextCols = input.cols ?? session.cols;
    const nextRows = input.rows ?? session.rows;

    if (session.child === null) {
      this.startSessionProcess(session);
    } else if (session.cols !== nextCols || session.rows !== nextRows) {
      session.cols = nextCols;
      session.rows = nextRows;
      session.updatedAt = nowIso();
      session.child.resize(session.cols, session.rows);
    }

    return createSnapshot(session);
  }

  async write(input: WriteTerminalSessionInput): Promise<void> {
    const session = this.sessions.get(input.sessionId);

    if (!session) {
      throw new Error('Terminal session is not initialized.');
    }

    if (session.child === null) {
      this.startSessionProcess(session);
    }

    session.child?.write(input.data);
  }

  async resize(input: ResizeTerminalSessionInput): Promise<void> {
    const session = this.sessions.get(input.sessionId);

    if (!session) {
      return;
    }

    session.cols = input.cols;
    session.rows = input.rows;
    session.updatedAt = nowIso();
    session.child?.resize(input.cols, input.rows);
  }

  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return;
    }

    session.child?.kill();
    session.child = null;
    session.pid = null;
    this.sessions.delete(sessionId);
  }

  dispose(): void {
    for (const sessionId of [...this.sessions.keys()]) {
      void this.close(sessionId);
    }
  }

  private ensureSession(input: OpenTerminalSessionInput): TerminalSession {
    const existing = this.sessions.get(input.sessionId);

    if (existing) {
      existing.cwd = input.cwd;
      existing.cols = input.cols ?? existing.cols;
      existing.rows = input.rows ?? existing.rows;
      existing.updatedAt = nowIso();
      return existing;
    }

    const session: TerminalSession = {
      sessionId: input.sessionId,
      cwd: input.cwd,
      cols: input.cols ?? DEFAULT_TERMINAL_COLS,
      rows: input.rows ?? DEFAULT_TERMINAL_ROWS,
      status: 'starting',
      child: null,
      pid: null,
      history: '',
      exitCode: null,
      exitSignal: null,
      error: null,
      updatedAt: nowIso(),
    };

    this.sessions.set(input.sessionId, session);

    return session;
  }

  private startSessionProcess(session: TerminalSession): void {
    const shell = resolveShellCommand();

    session.status = 'starting';
    session.exitCode = null;
    session.exitSignal = null;
    session.error = null;
    session.updatedAt = nowIso();

    try {
      const child = spawnPty(shell, [], {
        name: 'xterm-256color',
        cwd: session.cwd,
        cols: session.cols,
        rows: session.rows,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      });

      session.child = child;
      session.pid = child.pid;
      session.status = 'running';
      session.updatedAt = nowIso();

      child.onData((data) => {
        session.history = pruneTerminalHistory(`${session.history}${data}`);
        session.updatedAt = nowIso();
        this.emit('event', {
          type: 'output',
          sessionId: session.sessionId,
          data,
        });
      });

      child.onExit(({ exitCode, signal }) => {
        const normalizedSignal = signal ?? null;

        session.child = null;
        session.pid = null;
        session.status = 'exited';
        session.exitCode = exitCode;
        session.exitSignal = normalizedSignal;
        session.updatedAt = nowIso();

        const detail = [
          typeof exitCode === 'number' ? `code ${exitCode}` : null,
          typeof normalizedSignal === 'number' ? `signal ${normalizedSignal}` : null,
        ]
          .filter((value): value is string => value !== null)
          .join(', ');
        const message =
          detail.length > 0
            ? `\r\n[devland] Terminal exited (${detail})\r\n`
            : '\r\n[devland] Terminal exited\r\n';

        session.history = pruneTerminalHistory(`${session.history}${message}`);
        this.emit('event', {
          type: 'output',
          sessionId: session.sessionId,
          data: message,
        });
        this.emit('event', {
          type: 'exited',
          sessionId: session.sessionId,
          exitCode,
          exitSignal: normalizedSignal,
        });
      });

      this.emit('event', {
        type: 'started',
        sessionId: session.sessionId,
        snapshot: createSnapshot(session),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start terminal.';

      session.child = null;
      session.pid = null;
      session.status = 'error';
      session.error = message;
      session.updatedAt = nowIso();
      session.history = pruneTerminalHistory(`${session.history}\r\n[devland] ${message}\r\n`);

      this.emit('event', {
        type: 'output',
        sessionId: session.sessionId,
        data: `\r\n[devland] ${message}\r\n`,
      });
      this.emit('event', {
        type: 'error',
        sessionId: session.sessionId,
        message,
      });
    }
  }
}

export const terminalSessionManager = new TerminalSessionManager();
