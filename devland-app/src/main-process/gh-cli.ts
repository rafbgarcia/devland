import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_CONCURRENT_GH_PROCESSES = 2;
const MAX_QUEUED_GH_PROCESSES = 20;

export type GH = <T = unknown>(args: readonly string[]) => Promise<T>;

let activeGhProcessCount = 0;
const ghProcessQueue: Array<() => void> = [];

const GH_COMMON_PATHS: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: ['/opt/homebrew/bin/gh', '/usr/local/bin/gh'],
  linux: ['/usr/bin/gh', '/usr/local/bin/gh', '/snap/bin/gh'],
  win32: [
    'C:\\Program Files\\GitHub CLI\\gh.exe',
    'C:\\Program Files (x86)\\GitHub CLI\\gh.exe',
  ],
};

const getGhExecOptions = () => ({
  env: {
    ...process.env,
    GH_PROMPT_DISABLED: '1',
  },
  timeout: 30000,
  windowsHide: true,
});

const getPathExecutableCandidates = (executableName: string): string[] => {
  const pathValue = process.env.PATH ?? '';

  return pathValue
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.join(directory, executableName));
};

const resolveGhExecutable = (): string | null => {
  const executableName = process.platform === 'win32' ? 'gh.exe' : 'gh';
  const candidates = [
    ...getPathExecutableCandidates(executableName),
    ...(GH_COMMON_PATHS[process.platform] ?? []),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const acquireGhProcessSlot = async (): Promise<void> => {
  if (activeGhProcessCount < MAX_CONCURRENT_GH_PROCESSES) {
    activeGhProcessCount += 1;
    return;
  }

  if (ghProcessQueue.length >= MAX_QUEUED_GH_PROCESSES) {
    throw new Error('GitHub CLI request queue overflow. Too many concurrent gh commands.');
  }

  await new Promise<void>((resolve) => {
    ghProcessQueue.push(() => {
      activeGhProcessCount += 1;
      resolve();
    });
  });
};

const releaseGhProcessSlot = (): void => {
  activeGhProcessCount = Math.max(0, activeGhProcessCount - 1);
  const next = ghProcessQueue.shift();

  if (next !== undefined) {
    next();
  }
};

const runGhCommand = async (
  ghExecutable: string,
  args: readonly string[],
): Promise<string> => {
  await acquireGhProcessSlot();

  try {
    const { stdout } = await execFileAsync(ghExecutable, [...args], getGhExecOptions());
    return stdout.trim();
  } finally {
    releaseGhProcessSlot();
  }
};

const createGh = (ghExecutable: string): GH => {
  return async <T>(args: readonly string[]) => {
    const output = await runGhCommand(ghExecutable, args);

    if (!output) {
      throw new Error(`GitHub CLI returned an empty response for: gh ${args.join(' ')}`);
    }

    return JSON.parse(output) as T;
  };
};

export const ghExecutable = resolveGhExecutable();
export const gh = ghExecutable === null ? null : createGh(ghExecutable);
