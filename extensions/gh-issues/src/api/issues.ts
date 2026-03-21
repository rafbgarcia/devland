import type { DevlandRepoContext } from '@devlandapp/sdk';
import { z } from 'zod';

import { runJsonCommand } from '@/lib/devland';
import {
  GitHubLabelSchema,
  GitHubUserWithAvatarSchema,
  IssueCommentSchema,
  ProjectIssueFeedSchema,
  ProjectIssueFeedItemSchema,
  type ProjectIssueFeed,
} from '@/types/issues';

const GH_GRAPHQL_CACHE_TTL_SECONDS = 60 * 60;

const GitHubNodeIdSchema = z.union([z.string(), z.number()]).transform(String);

const IssueCommentResponseSchema = IssueCommentSchema.extend({
  id: GitHubNodeIdSchema,
});

const IssueResponseNodeSchema = z
  .object({
    id: GitHubNodeIdSchema,
    number: z.number().int().positive(),
    title: z.string().min(1),
    url: z.string().url(),
    state: z.string().min(1),
    author: GitHubUserWithAvatarSchema.nullable(),
    bodyHTML: z.string(),
    comments: z.object({
      totalCount: z.number().int().nonnegative(),
      nodes: z.array(IssueCommentResponseSchema),
    }),
    labels: z.object({
      nodes: z.array(GitHubLabelSchema),
    }),
    createdAt: z.string().min(1),
  })
  .transform(({ comments, labels, ...issue }) => ({
    ...issue,
    commentCount: comments.totalCount,
    commentAuthors: comments.nodes.map(({ author }) => author),
    comments: comments.nodes,
    labels: labels.nodes,
  }))
  .pipe(ProjectIssueFeedItemSchema);

const IssuesResponseSchema = z.object({
  data: z.object({
    repository: z.object({
      issues: z.object({
        nodes: z.array(IssueResponseNodeSchema),
      }),
    }),
  }),
});

const buildIssueQueryArgs = (
  owner: string,
  name: string,
  skipCache: boolean,
): string[] => {
  const args = ['api', 'graphql'];

  if (!skipCache) {
    args.push('--cache', `${GH_GRAPHQL_CACHE_TTL_SECONDS}s`);
  }

  args.push(
    '-f',
    `query=${ISSUES_QUERY}`,
    '-f',
    `owner=${owner}`,
    '-f',
    `name=${name}`,
  );

  return args;
};

const fetchIssues = async (
  owner: string,
  name: string,
  skipCache: boolean,
) =>
  await runJsonCommand(
    {
      command: 'gh',
      args: buildIssueQueryArgs(owner, name, skipCache),
    },
    IssuesResponseSchema,
  );

export async function getProjectIssues(
  repo: Pick<DevlandRepoContext, 'owner' | 'name'>,
  skipCache = false,
): Promise<ProjectIssueFeed> {
  const response = await fetchIssues(repo.owner, repo.name, skipCache)
    .catch(async (error: unknown) => {
      if (skipCache) {
        throw error;
      }

      return await fetchIssues(repo.owner, repo.name, true);
    });

  return ProjectIssueFeedSchema.parse({
    fetchedAt: Date.now(),
    items: response.data.repository.issues.nodes,
  });
}

const ISSUES_QUERY = `
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issues(
      first: 20
      states: OPEN
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      nodes {
        id
        number
        title
        url
        state
        author {
          login
          avatarUrl
        }
        bodyHTML
        comments(first: 20) {
          totalCount
          nodes {
            id
            bodyHTML
            createdAt
            author {
              login
              avatarUrl
            }
          }
        }
        labels(first: 10) {
          nodes {
            name
            color
          }
        }
        createdAt
      }
    }
  }
}
`.replace(/\n\s*/g, ' ').trim();
