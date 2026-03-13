import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_CONCURRENT_GH_PROCESSES = 2;
const MAX_QUEUED_GH_PROCESSES = 20;

export type GH = <T = unknown>(args: readonly string[]) => Promise<T>;
export type GhResponse<T> = {
  body: T;
  headers: Record<string, string>;
  statusLine: string;
};

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

const parseIncludedOutput = (output: string): GhResponse<string> => {
  const normalizedOutput = output.replace(/\r\n/g, '\n');
  const separatorIndex = normalizedOutput.indexOf('\n\n');

  if (separatorIndex === -1) {
    throw new Error('GitHub CLI response headers were requested but not returned.');
  }

  const headerBlock = normalizedOutput.slice(0, separatorIndex).trim();
  const body = normalizedOutput.slice(separatorIndex + 2).trim();

  if (!headerBlock || !body) {
    throw new Error('GitHub CLI returned an incomplete response.');
  }

  const [statusLine = '', ...headerLines] = headerBlock.split('\n');
  const headers: Record<string, string> = {};

  for (const line of headerLines) {
    const separator = line.indexOf(':');

    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key) {
      headers[key] = value;
    }
  }

  if (!statusLine) {
    throw new Error('GitHub CLI response status line is missing.');
  }

  return { body, headers, statusLine };
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

const createGhWithResponse = (
  ghExecutable: string,
): (<T = unknown>(args: readonly string[]) => Promise<GhResponse<T>>) => {
  return async <T>(args: readonly string[]) => {
    const output = await runGhCommand(ghExecutable, [...args, '--include']);

    if (!output) {
      throw new Error(`GitHub CLI returned an empty response for: gh ${args.join(' ')}`);
    }

    const response = parseIncludedOutput(output);

    return {
      ...response,
      body: JSON.parse(response.body) as T,
    };
  };
};

export const ghExecutable = resolveGhExecutable();
export const gh = ghExecutable === null ? null : createGh(ghExecutable);
export const ghWithResponse =
  ghExecutable === null ? null : createGhWithResponse(ghExecutable);
