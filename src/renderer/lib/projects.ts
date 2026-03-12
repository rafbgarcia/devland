import {
  DEFAULT_PROJECT_VIEW_TAB,
  PROJECT_VIEW_TABS,
  type ProjectViewTab,
  type Repo,
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

export const getProjectTabRouteTo = (tab: ProjectViewTab): ProjectTabRouteTo => {
  switch (tab) {
    case 'code':
      return '/projects/$repoId/code';
    case 'pull-requests':
      return '/projects/$repoId/pull-requests';
    case 'issues':
      return '/projects/$repoId/issues';
    case 'channels':
      return '/projects/$repoId/channels';
  }
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
