import { existsSync } from 'node:fs';
import path from 'node:path';

const GH_COMMON_PATHS: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: ['/opt/homebrew/bin/gh', '/usr/local/bin/gh'],
  linux: ['/usr/bin/gh', '/usr/local/bin/gh', '/snap/bin/gh'],
  win32: [
    'C:\\Program Files\\GitHub CLI\\gh.exe',
    'C:\\Program Files (x86)\\GitHub CLI\\gh.exe',
  ],
};

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

export const ghExecutable = resolveGhExecutable();
