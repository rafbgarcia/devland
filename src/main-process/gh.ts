import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type GH = <T = unknown>(args: readonly string[]) => Promise<T>;

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

const createGh = (ghExecutable: string): GH => {
  return async <T>(args: readonly string[]) => {
    const { stdout } = await execFileAsync(ghExecutable, [...args], getGhExecOptions());
    const output = stdout.trim();

    if (!output) {
      throw new Error(`GitHub CLI returned an empty response for: gh ${args.join(' ')}`);
    }

    return JSON.parse(output) as T;
  };
};

export const ghExecutable = resolveGhExecutable();
export const gh = ghExecutable === null ? null : createGh(ghExecutable);
