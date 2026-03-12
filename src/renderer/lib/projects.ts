import { dayjs } from '@/lib/dayjs';

export const isAbsoluteProjectPath = (value: string): boolean =>
  value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');

export const getProjectLabel = (projectPath: string): string => {
  if (!isAbsoluteProjectPath(projectPath)) {
    return projectPath;
  }

  const normalizedPath = projectPath.replace(/[\\/]+$/, '');
  const segments = normalizedPath.split(/[\\/]/).filter(Boolean);

  return segments.at(-1) ?? projectPath;
};

export const formatRelativeTime = (value: string | number): string =>
  dayjs(value).fromNow();
