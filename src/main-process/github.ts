import {
  ProjectIssueFeedSchema,
  ProjectPullRequestFeedSchema,
  type IssueDetail,
  type ProjectFeed,
  type ProjectFeedKind,
  type ProjectIssueFeed,
  type ProjectPullRequestFeed,
} from '../ipc/contracts';
import { resolveGitHubSlugFromProjectPath } from './git';
import { getRepositoryIssueDetail } from './gh-queries/issue-detail';
import { getRepositoryIssues } from './gh-queries/issues';
import { getRepositoryPullRequests } from './gh-queries/pull-requests';
export { getGhUser } from './gh-queries/user';

const splitSlug = (slug: string): { owner: string; name: string } => {
  const [owner = '', name = ''] = slug.split('/');
  return { owner, name };
};

export function getProjectFeed(
  projectPath: string,
  kind: 'issues',
  skipCache?: boolean,
): Promise<ProjectIssueFeed>;
export function getProjectFeed(
  projectPath: string,
  kind: 'pull-requests',
  skipCache?: boolean,
): Promise<ProjectPullRequestFeed>;
export async function getProjectFeed(
  projectPath: string,
  kind: ProjectFeedKind,
  skipCache = false,
): Promise<ProjectFeed> {
  const githubSlug = await resolveGitHubSlugFromProjectPath(projectPath);
  const { owner, name } = splitSlug(githubSlug);

  if (kind === 'issues') {
    const { items, fetchedAt } = await getRepositoryIssues(owner, name, skipCache);
    return ProjectIssueFeedSchema.parse({
      kind,
      githubSlug,
      projectPath,
      fetchedAt,
      items,
    });
  }

  const { items, fetchedAt } = await getRepositoryPullRequests(owner, name, skipCache);
  return ProjectPullRequestFeedSchema.parse({
    kind,
    githubSlug,
    projectPath,
    fetchedAt,
    items,
  });
}

export async function getIssueDetail(
  projectPath: string,
  issueNumber: number,
): Promise<IssueDetail> {
  const githubSlug = await resolveGitHubSlugFromProjectPath(projectPath);
  const { owner, name } = splitSlug(githubSlug);

  return getRepositoryIssueDetail(owner, name, issueNumber);
}
