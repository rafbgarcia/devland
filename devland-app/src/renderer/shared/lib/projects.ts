import {
  type AppShortcutDirection,
  DEFAULT_PROJECT_VIEW_TAB,
  PROJECT_VIEW_TABS,
  type ProjectViewTab,
  type Repo,
} from '@/ipc/contracts';

export type ProjectTabRouteTo =
  | '/projects/$repoId/code'
  | '/projects/$repoId/issues';

export type ProjectIssueDetailPath = `/projects/${string}/issues/${number}`;

export type ProjectExtensionTabId = `extension:${string}`;

export type ProjectTabId = ProjectViewTab | ProjectExtensionTabId;

const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PROJECT_VIEW_TAB_SET = new Set<string>(PROJECT_VIEW_TABS);
const EXTENSION_TAB_ID_PREFIX = 'extension:';
const LEGACY_PULL_REQUESTS_TAB_ID = 'pull-requests';
const GITHUB_PULL_REQUESTS_EXTENSION_ID = 'gh-prs';

const PROJECT_TAB_ROUTE_BY_VALUE: Record<ProjectViewTab, ProjectTabRouteTo> = {
  code: '/projects/$repoId/code',
  issues: '/projects/$repoId/issues',
};

export const isAbsoluteProjectPath = (value: string): boolean =>
  value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');

export const isGitHubProjectReference = (value: string): boolean =>
  GITHUB_REPO_PATTERN.test(value);

export const normalizeProjectInput = (value: string): string => {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error('Repository path is required.');
  }

  if (isAbsoluteProjectPath(normalizedValue) || isGitHubProjectReference(normalizedValue)) {
    return normalizedValue;
  }

  throw new Error(
    'Repository must be an absolute path or a GitHub owner/repository string.',
  );
};

export const getProjectStorageKey = (projectPath: string): string => {
  if (isAbsoluteProjectPath(projectPath)) {
    return projectPath.replace(/[\\/]+$/, '') || projectPath;
  }

  return projectPath.toLowerCase();
};

export const getProjectLabel = (projectPath: string): string => {
  if (!isAbsoluteProjectPath(projectPath)) {
    return projectPath;
  }

  const normalizedPath = projectPath.replace(/[\\/]+$/, '');
  const segments = normalizedPath.split(/[\\/]/).filter(Boolean);

  return segments.at(-1) ?? projectPath;
};

export const isProjectViewTab = (value: string): value is ProjectViewTab =>
  PROJECT_VIEW_TAB_SET.has(value);

export const resolveProjectViewTab = (
  value: string | null | undefined,
): ProjectViewTab => {
  if (value !== undefined && value !== null && isProjectViewTab(value)) {
    return value;
  }

  return DEFAULT_PROJECT_VIEW_TAB;
};

export const resolvePreferredRepoId = (
  repos: Repo[],
  preferredRepoId: string | null | undefined,
): string | null => {
  if (
    preferredRepoId !== undefined &&
    preferredRepoId !== null &&
    repos.some((repo) => repo.id === preferredRepoId)
  ) {
    return preferredRepoId;
  }

  return repos[0]?.id ?? null;
};

export const getProjectTabRouteTo = (tab: ProjectViewTab): ProjectTabRouteTo =>
  PROJECT_TAB_ROUTE_BY_VALUE[tab];

export const toProjectExtensionTabId = (
  extensionId: string,
): ProjectExtensionTabId => `${EXTENSION_TAB_ID_PREFIX}${extensionId}` as ProjectExtensionTabId;

export const getProjectExtensionIdFromTabId = (
  tabId: string | null | undefined,
): string | null => {
  if (
    tabId === undefined ||
    tabId === null ||
    !tabId.startsWith(EXTENSION_TAB_ID_PREFIX)
  ) {
    return null;
  }

  const extensionId = tabId.slice(EXTENSION_TAB_ID_PREFIX.length).trim();

  return extensionId === '' ? null : extensionId;
};

export const resolveProjectTabId = (
  value: string | null | undefined,
  fallbackTabId: ProjectTabId = DEFAULT_PROJECT_VIEW_TAB,
): ProjectTabId => {
  if (value !== undefined && value !== null) {
    if (value === LEGACY_PULL_REQUESTS_TAB_ID) {
      return toProjectExtensionTabId(GITHUB_PULL_REQUESTS_EXTENSION_ID);
    }

    if (isProjectViewTab(value)) {
      return value;
    }

    const extensionId = getProjectExtensionIdFromTabId(value);

    if (extensionId !== null) {
      return toProjectExtensionTabId(extensionId);
    }
  }

  return fallbackTabId;
};

export const getProjectTabIdFromRouteMatch = ({
  fullPath,
  extensionId,
}: {
  fullPath: string | null | undefined;
  extensionId?: string | null | undefined;
}): ProjectTabId => {
  switch (fullPath) {
    case '/projects/$repoId/code':
      return 'code';
    case '/projects/$repoId/issues':
      return 'issues';
    case '/projects/$repoId/extensions/$extensionId':
      return extensionId ? toProjectExtensionTabId(extensionId) : DEFAULT_PROJECT_VIEW_TAB;
    default:
      return DEFAULT_PROJECT_VIEW_TAB;
  }
};

export const getProjectTabRoute = (
  repoId: string,
  tabId: ProjectTabId,
):
  | { to: ProjectTabRouteTo; params: { repoId: string } }
  | {
      to: '/projects/$repoId/extensions/$extensionId';
      params: { repoId: string; extensionId: string };
    } => {
  const extensionId = getProjectExtensionIdFromTabId(tabId);

  if (extensionId !== null) {
    return {
      to: '/projects/$repoId/extensions/$extensionId',
      params: {
        repoId,
        extensionId,
      },
    };
  }

  return {
    to: getProjectTabRouteTo(resolveProjectViewTab(tabId)),
    params: { repoId },
  };
};

export const getProjectTabRepoIdByShortcutSlot = (
  repos: Repo[],
  slot: number,
): string | null => {
  if (slot === 9) {
    return repos.at(-1)?.id ?? null;
  }

  return repos[slot - 1]?.id ?? null;
};

export const getAdjacentProjectTabRepoId = (
  repos: Repo[],
  activeRepoId: string | null,
  direction: AppShortcutDirection,
): string | null => {
  if (repos.length === 0) {
    return null;
  }

  if (activeRepoId === null) {
    return direction === 'previous'
      ? (repos.at(-1)?.id ?? null)
      : (repos[0]?.id ?? null);
  }

  const activeRepoIndex = repos.findIndex((repo) => repo.id === activeRepoId);

  if (activeRepoIndex === -1) {
    return direction === 'previous'
      ? (repos.at(-1)?.id ?? null)
      : (repos[0]?.id ?? null);
  }

  const adjacentRepoIndex = direction === 'next'
    ? (activeRepoIndex + 1) % repos.length
    : (activeRepoIndex - 1 + repos.length) % repos.length;

  return repos[adjacentRepoIndex]?.id ?? null;
};

export const getProjectIssueDetailPath = (
  repoId: string,
  issueNumber: number,
): ProjectIssueDetailPath =>
  `/projects/${encodeURIComponent(repoId)}/issues/${issueNumber}`;
