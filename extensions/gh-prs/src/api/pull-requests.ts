import type { DevlandRepoContext } from '@devlandapp/sdk';
import { z } from 'zod';

import { runJsonCommand } from '@/lib/devland';
import {
  GitHubLabelSchema,
  GitHubUserWithAvatarSchema,
  ProjectPullRequestFeedSchema,
  ProjectPullRequestFeedItemSchema,
  PullRequestCommentSchema,
  type ProjectPullRequestFeed,
} from '@/types/pull-requests';

const GitHubNodeIdSchema = z.union([z.string(), z.number()]).transform(String);

const PullRequestCommentResponseSchema = PullRequestCommentSchema.extend({
  id: GitHubNodeIdSchema,
});

const PullRequestResponseNodeSchema = z
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
      nodes: z.array(PullRequestCommentResponseSchema),
    }),
    labels: z.object({
      nodes: z.array(GitHubLabelSchema),
    }),
    createdAt: z.string().min(1),
    isDraft: z.boolean(),
    commits: z.object({
      totalCount: z.number().int().nonnegative(),
    }),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
  })
  .transform(({ comments, commits, labels, ...pullRequest }) => ({
    ...pullRequest,
    commentCount: comments.totalCount,
    commentAuthors: comments.nodes.map(({ author }) => author),
    comments: comments.nodes,
    labels: labels.nodes,
    commitCount: commits.totalCount,
  }))
  .pipe(ProjectPullRequestFeedItemSchema);

const PullRequestsResponseSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequests: z.object({
        nodes: z.array(PullRequestResponseNodeSchema),
      }),
    }),
  }),
});

const buildPullRequestQueryArgs = (owner: string, name: string): string[] => {
  const args = ['api', 'graphql'];

  args.push(
    '-f',
    `query=${PULL_REQUESTS_QUERY}`,
    '-f',
    `owner=${owner}`,
    '-f',
    `name=${name}`,
  );

  return args;
};

const fetchPullRequests = async (
  owner: string,
  name: string,
) =>
  await runJsonCommand(
    {
      command: 'gh',
      args: buildPullRequestQueryArgs(owner, name),
    },
    PullRequestsResponseSchema,
  );

export async function getProjectPullRequests(
  repo: Pick<DevlandRepoContext, 'owner' | 'name'>,
): Promise<ProjectPullRequestFeed> {
  const response = await fetchPullRequests(repo.owner, repo.name);

  return ProjectPullRequestFeedSchema.parse({
    fetchedAt: Date.now(),
    items: response.data.repository.pullRequests.nodes,
  });
}

const PULL_REQUESTS_QUERY = `
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(
      first: 20
      states: OPEN
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      nodes {
        id
        number
        title
        url
        isDraft
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
        commits {
          totalCount
        }
        additions
        deletions
      }
    }
  }
}
`.replace(/\n\s*/g, ' ').trim();
