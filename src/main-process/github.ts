import { z } from 'zod';

import type { GhUser, ProjectFeedKind, ProjectFeedItem, ProjectFeed } from '../ipc/contracts';
import { resolveGitHubSlugFromProjectPath } from './git';
import { gh } from './gh';
import { ISSUES_QUERY } from './gh-queries/issues';
import { PULL_REQUESTS_QUERY } from './gh-queries/pull-requests';

const GhUserSchema: z.ZodType<GhUser> = z.object({
  login: z.string().min(1),
});

const GqlLabelSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
});

const GqlCommentNodeSchema = z.object({
  author: z.object({ login: z.string().min(1) }).nullable().optional(),
});

const GqlIssueNodeSchema = z.object({
  id: z.union([z.string(), z.number()]),
  number: z.number().int().positive(),
  title: z.string().min(1),
  url: z.string().url(),
  state: z.string().min(1),
  author: z.object({ login: z.string().min(1) }).nullable().optional(),
  comments: z.object({
    totalCount: z.number().int().nonnegative(),
    nodes: z.array(GqlCommentNodeSchema),
  }),
  labels: z.object({
    nodes: z.array(GqlLabelSchema),
  }),
  updatedAt: z.string().min(1),
});

const GqlPrNodeSchema = GqlIssueNodeSchema.extend({
  commits: z.object({ totalCount: z.number().int().nonnegative() }),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});

const GqlIssuesResponseSchema = z.object({
  data: z.object({
    repository: z.object({
      issues: z.object({
        nodes: z.array(GqlIssueNodeSchema),
      }),
    }),
  }),
});

const GqlPullRequestsResponseSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequests: z.object({
        nodes: z.array(GqlPrNodeSchema),
      }),
    }),
  }),
});

const uniqueCommentAuthors = (nodes: z.infer<typeof GqlCommentNodeSchema>[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const node of nodes) {
    const login = node.author?.login;
    if (login && !seen.has(login)) {
      seen.add(login);
      result.push(login);
    }
  }

  return result;
};

const toFeedItem = (node: z.infer<typeof GqlIssueNodeSchema>): ProjectFeedItem => ({
  id: String(node.id),
  number: node.number,
  title: node.title,
  url: node.url,
  state: node.state.toLowerCase(),
  authorLogin: node.author?.login ?? 'unknown',
  commentCount: node.comments.totalCount,
  commentAuthors: uniqueCommentAuthors(node.comments.nodes),
  labels: node.labels.nodes.map((label) => ({ name: label.name, color: label.color })),
  updatedAt: node.updatedAt,
});

const toPrFeedItem = (node: z.infer<typeof GqlPrNodeSchema>): ProjectFeedItem => ({
  ...toFeedItem(node),
  commitCount: node.commits.totalCount,
  additions: node.additions,
  deletions: node.deletions,
});

const splitSlug = (slug: string): { owner: string; name: string } => {
  const [owner = '', name = ''] = slug.split('/');
  return { owner, name };
};

export const getGhUser = async (): Promise<GhUser | null> => {
  if (gh === null) {
    return null;
  }

  try {
    return GhUserSchema.parse(await gh(['api', 'user']));
  } catch {
    return null;
  }
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const fetchGraphQL = async (query: string, owner: string, name: string) => {
  if (gh === null) {
    throw new Error('GitHub CLI is not installed or could not be found.');
  }

  return gh(['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`]);
};

type FeedCache = { feed: ProjectFeed; fetchedAt: number };
const feedCache = new Map<string, FeedCache>();

const getCacheKey = (projectPath: string, kind: ProjectFeedKind): string =>
  `${projectPath}::${kind}`;

export const getProjectFeed = async (
  projectPath: string,
  kind: ProjectFeedKind,
  skipCache = false,
): Promise<ProjectFeed> => {
  const cacheKey = getCacheKey(projectPath, kind);
  const cached = feedCache.get(cacheKey);

  if (!skipCache && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.feed;
  }

  const githubSlug = await resolveGitHubSlugFromProjectPath(projectPath);
  const { owner, name } = splitSlug(githubSlug);
  const fetchedAt = Date.now();

  let items: ProjectFeedItem[];

  if (kind === 'issues') {
    const response = GqlIssuesResponseSchema.parse(
      await fetchGraphQL(ISSUES_QUERY, owner, name),
    );
    items = response.data.repository.issues.nodes.map(toFeedItem);
  } else {
    const response = GqlPullRequestsResponseSchema.parse(
      await fetchGraphQL(PULL_REQUESTS_QUERY, owner, name),
    );
    items = response.data.repository.pullRequests.nodes.map(toPrFeedItem);
  }

  const feed: ProjectFeed = { githubSlug, projectPath, fetchedAt, items };
  feedCache.set(cacheKey, { feed, fetchedAt });

  return feed;
};
