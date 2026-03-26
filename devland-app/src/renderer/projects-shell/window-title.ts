const DEFAULT_APP_WINDOW_TITLE = 'Devland';

function normalizeDisplayPath(value: string): string {
  if (value === '') {
    return value;
  }

  const normalized = value.replace(/\\/g, '/');

  if (normalized === '/' || /^[A-Za-z]:\/$/.test(normalized)) {
    return normalized;
  }

  return normalized.replace(/\/+$/, '');
}

function isWindowsLikePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}

export function replaceHomeDirectoryForDisplay(
  path: string,
  homeDirectory: string | null,
): string {
  const trimmedPath = path.trim();
  const trimmedHomeDirectory = homeDirectory?.trim() ?? '';

  if (trimmedPath === '' || trimmedHomeDirectory === '') {
    return trimmedPath;
  }

  const normalizedPath = normalizeDisplayPath(trimmedPath);
  const normalizedHomeDirectory = normalizeDisplayPath(trimmedHomeDirectory);
  const compareCaseInsensitive =
    isWindowsLikePath(trimmedPath) || isWindowsLikePath(trimmedHomeDirectory);
  const comparablePath = compareCaseInsensitive ? normalizedPath.toLowerCase() : normalizedPath;
  const comparableHomeDirectory = compareCaseInsensitive
    ? normalizedHomeDirectory.toLowerCase()
    : normalizedHomeDirectory;

  if (comparablePath === comparableHomeDirectory) {
    return '~';
  }

  const homePrefix = `${comparableHomeDirectory}/`;

  if (!comparablePath.startsWith(homePrefix)) {
    return trimmedPath;
  }

  return `~/${normalizedPath.slice(normalizedHomeDirectory.length + 1)}`;
}

export function buildProjectWindowTitle(input: {
  projectPath: string | null;
  branchName: string | null;
  homeDirectory?: string | null;
  appName?: string;
}): string {
  const appName = input.appName?.trim() || DEFAULT_APP_WINDOW_TITLE;
  const projectPath = input.projectPath?.trim() ?? '';
  const branchName = input.branchName?.trim() ?? '';
  const displayProjectPath =
    projectPath === ''
      ? ''
      : replaceHomeDirectoryForDisplay(projectPath, input.homeDirectory ?? null);

  if (displayProjectPath !== '' && branchName !== '') {
    return `${appName} ${displayProjectPath} @ ${branchName}`;
  }

  if (displayProjectPath !== '') {
    return `${appName} ${displayProjectPath}`;
  }

  return appName;
}
