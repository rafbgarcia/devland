import {
  type AppShortcutDirection,
  DEFAULT_PROJECT_VIEW_TAB,
  PROJECT_VIEW_TABS,
  type ProjectViewTab,
  type Repo,
  type WorkspaceSession,
} from '@/ipc/contracts';
import { dayjs } from '@/lib/dayjs';

export type ProjectTabRouteTo =
  | '/projects/$repoId/code'
  | '/projects/$repoId/pull-requests'
  | '/projects/$repoId/issues'
  | '/projects/$repoId/channels';

export type ProjectIssueDetailPath = `/projects/${string}/issues/${number}`;

export type ProjectPullRequestDetailPath = `/projects/${string}/pull-requests/${number}`;

export const isAbsoluteProjectPath = (value: string): boolean =>
  value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');

const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

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

export const formatRelativeTime = (value: string | number): string =>
  dayjs(value).fromNow();

const PROJECT_VIEW_TAB_SET = new Set<string>(PROJECT_VIEW_TABS);

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

const PROJECT_TAB_ROUTE_BY_VALUE: Record<ProjectViewTab, ProjectTabRouteTo> = {
  code: '/projects/$repoId/code',
  'pull-requests': '/projects/$repoId/pull-requests',
  issues: '/projects/$repoId/issues',
  channels: '/projects/$repoId/channels',
};

export const getProjectTabRouteTo = (tab: ProjectViewTab): ProjectTabRouteTo =>
  PROJECT_TAB_ROUTE_BY_VALUE[tab];

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

export const DEFAULT_WORKSPACE_SESSION: WorkspaceSession = {
  activeRepoId: null,
  activeTab: DEFAULT_PROJECT_VIEW_TAB,
};

export const sanitizeWorkspaceSession = (value: unknown): WorkspaceSession => {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_WORKSPACE_SESSION;
  }

  const record = value as Record<string, unknown>;

  return {
    activeRepoId:
      typeof record.activeRepoId === 'string' && record.activeRepoId.trim() !== ''
        ? record.activeRepoId
        : null,
    activeTab: resolveProjectViewTab(
      typeof record.activeTab === 'string' ? record.activeTab : null,
    ),
  };
};

export const getProjectIssueDetailPath = (
  repoId: string,
  issueNumber: number,
): ProjectIssueDetailPath =>
  `/projects/${encodeURIComponent(repoId)}/issues/${issueNumber}`;

export const getProjectPullRequestDetailPath = (
  repoId: string,
  pullRequestNumber: number,
): ProjectPullRequestDetailPath =>
  `/projects/${encodeURIComponent(repoId)}/pull-requests/${pullRequestNumber}`;
