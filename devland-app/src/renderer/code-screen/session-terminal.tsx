import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { Terminal, type ITheme } from '@xterm/xterm';
import { LoaderCircleIcon, TerminalIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { TerminalSessionSnapshot, TerminalSessionStatus } from '@/ipc/contracts';
import { Badge } from '@/shadcn/components/ui/badge';
import { cn } from '@/shadcn/lib/utils';

const FALLBACK_TERMINAL_HEIGHT = 320;

function getTerminalTheme(): ITheme {
  const bodyStyles = getComputedStyle(document.body);
  const isDark = document.documentElement.classList.contains('dark');

  return isDark
    ? {
        background: bodyStyles.backgroundColor || 'rgb(29, 34, 42)',
        foreground: bodyStyles.color || 'rgb(242, 238, 230)',
        cursor: 'rgb(166, 228, 205)',
        selectionBackground: 'rgba(156, 214, 193, 0.22)',
        black: 'rgb(27, 31, 39)',
        red: 'rgb(241, 130, 124)',
        green: 'rgb(139, 210, 169)',
        yellow: 'rgb(231, 201, 126)',
        blue: 'rgb(129, 177, 229)',
        magenta: 'rgb(196, 157, 226)',
        cyan: 'rgb(117, 203, 201)',
        white: 'rgb(220, 223, 228)',
        brightBlack: 'rgb(110, 117, 131)',
        brightRed: 'rgb(245, 158, 152)',
        brightGreen: 'rgb(170, 226, 190)',
        brightYellow: 'rgb(238, 214, 150)',
        brightBlue: 'rgb(159, 198, 240)',
        brightMagenta: 'rgb(215, 184, 239)',
        brightCyan: 'rgb(154, 221, 220)',
        brightWhite: 'rgb(245, 246, 248)',
      }
    : {
        background: 'rgb(249, 244, 236)',
        foreground: bodyStyles.color || 'rgb(42, 52, 68)',
        cursor: 'rgb(45, 121, 101)',
        selectionBackground: 'rgba(80, 123, 113, 0.18)',
        black: 'rgb(61, 69, 80)',
        red: 'rgb(184, 83, 75)',
        green: 'rgb(57, 120, 89)',
        yellow: 'rgb(155, 121, 48)',
        blue: 'rgb(78, 111, 168)',
        magenta: 'rgb(132, 92, 150)',
        cyan: 'rgb(54, 129, 135)',
        white: 'rgb(216, 208, 196)',
        brightBlack: 'rgb(115, 122, 132)',
        brightRed: 'rgb(204, 104, 96)',
        brightGreen: 'rgb(82, 142, 111)',
        brightYellow: 'rgb(182, 143, 62)',
        brightBlue: 'rgb(101, 132, 188)',
        brightMagenta: 'rgb(153, 114, 172)',
        brightCyan: 'rgb(76, 152, 157)',
        brightWhite: 'rgb(240, 235, 226)',
      };
}

function lastPathSegment(cwd: string): string {
  const normalized = cwd.trim().replace(/[\\/]+$/, '');

  if (normalized.length === 0) {
    return cwd;
  }

  return normalized.split(/[/\\]/).at(-1) ?? cwd;
}

function statusLabel(status: TerminalSessionStatus): string {
  switch (status) {
    case 'starting':
      return 'Starting';
    case 'running':
      return 'Running';
    case 'exited':
      return 'Exited';
    case 'error':
      return 'Error';
  }
}

function statusVariant(status: TerminalSessionStatus): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'running':
      return 'default';
    case 'starting':
      return 'secondary';
    case 'exited':
      return 'outline';
    case 'error':
      return 'destructive';
  }
}

export function SessionTerminal({
  sessionId,
  cwd,
  className,
}: {
  sessionId: string;
  cwd: string;
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [snapshot, setSnapshot] = useState<TerminalSessionSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const headline = useMemo(() => lastPathSegment(cwd), [cwd]);
  const status = snapshot?.status ?? 'starting';

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontSize: 12,
      lineHeight: 1.2,
      scrollback: 5_000,
      fontFamily: '"SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
      theme: getTerminalTheme(),
    });
    const fitAddon = new FitAddon();
    let disposed = false;

    terminal.loadAddon(fitAddon);
    terminal.open(mount);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const syncViewport = () => {
      const activeTerminal = terminalRef.current;
      const activeFitAddon = fitAddonRef.current;

      if (!activeTerminal || !activeFitAddon) {
        return;
      }

      activeFitAddon.fit();
      void window.electronAPI.resizeTerminalSession({
        sessionId,
        cols: activeTerminal.cols,
        rows: activeTerminal.rows,
      }).catch(() => undefined);
    };

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(syncViewport);
    });
    resizeObserver.observe(mount);

    const themeObserver = new MutationObserver(() => {
      const activeTerminal = terminalRef.current;

      if (!activeTerminal) {
        return;
      }

      activeTerminal.options.theme = getTerminalTheme();
      activeTerminal.refresh(0, Math.max(activeTerminal.rows - 1, 0));
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    const inputDisposable = terminal.onData((data) => {
      void window.electronAPI.writeTerminalSession({ sessionId, data }).catch((error) => {
        if (disposed) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : 'Failed to write to terminal.');
      });
    });

    const unsubscribe = window.electronAPI.onTerminalSessionEvent((event) => {
      if (event.sessionId !== sessionId) {
        return;
      }

      if (event.type === 'output') {
        terminal.write(event.data);
        return;
      }

      if (event.type === 'started') {
        setSnapshot(event.snapshot);
        setLoadError(null);
        return;
      }

      if (event.type === 'exited') {
        setSnapshot((current) => current
          ? {
              ...current,
              status: 'exited',
              exitCode: event.exitCode,
              exitSignal: event.exitSignal,
              pid: null,
              updatedAt: new Date().toISOString(),
            }
          : current);
        return;
      }

      setSnapshot((current) => current
        ? {
            ...current,
            status: 'error',
            error: event.message,
            pid: null,
            updatedAt: new Date().toISOString(),
          }
        : current);
      setLoadError(event.message);
    });

    void window.electronAPI.openTerminalSession({
      sessionId,
      cwd,
      cols: terminal.cols,
      rows: terminal.rows,
    }).then((nextSnapshot) => {
      if (disposed) {
        return;
      }

      setSnapshot(nextSnapshot);
      setLoadError(null);
      terminal.write('\u001bc');

      if (nextSnapshot.history.length > 0) {
        terminal.write(nextSnapshot.history);
      }

      window.requestAnimationFrame(() => {
        terminal.focus();
      });
    }).catch((error) => {
      if (disposed) {
        return;
      }

      setLoadError(error instanceof Error ? error.message : 'Failed to open terminal.');
    });

    return () => {
      disposed = true;
      unsubscribe();
      inputDisposable.dispose();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      terminalRef.current = null;
      fitAddonRef.current = null;
      terminal.dispose();
    };
  }, [cwd, sessionId]);

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-card/35', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <TerminalIcon className="size-4 text-primary" />
            <span className="truncate">Terminal · {headline}</span>
          </div>
          <p className="truncate text-xs text-muted-foreground" title={cwd}>
            {cwd}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {snapshot === null && loadError === null ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LoaderCircleIcon className="size-3.5 animate-spin" />
              Preparing shell
            </div>
          ) : null}
          <Badge variant={statusVariant(status)}>
            {statusLabel(status)}
          </Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <div className="devland-terminal-shell h-full min-h-[320px] overflow-hidden rounded-xl border border-border/70 bg-card/90 shadow-sm">
          <div
            ref={mountRef}
            className="devland-terminal h-full w-full"
            style={{ minHeight: FALLBACK_TERMINAL_HEIGHT }}
          />
        </div>
      </div>

      {loadError ? (
        <div className="border-t border-border/70 px-4 py-2 text-xs text-destructive">
          {loadError}
        </div>
      ) : null}
    </div>
  );
}
