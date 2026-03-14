import { z } from 'zod';

import {
  GitHubLabelSchema,
  GitHubUserWithAvatarSchema,
  ProjectPullRequestFeedItemSchema,
  type ProjectPullRequestFeedItem,
} from '../../ipc/contracts';
import { graphql } from '../gh-graphql';

const GitHubNodeIdSchema = z.union([z.string(), z.number()]).transform(String);

const PullRequestCommentAuthorSchema = z.object({
  author: GitHubUserWithAvatarSchema.nullable(),
});

const PullRequestResponseNodeSchema = z
  .object({
    id: GitHubNodeIdSchema,
    number: z.number().int().positive(),
    title: z.string().min(1),
    url: z.string().url(),
    state: z.string().min(1),
    author: GitHubUserWithAvatarSchema.nullable(),
    comments: z.object({
      totalCount: z.number().int().nonnegative(),
      nodes: z.array(PullRequestCommentAuthorSchema),
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

export async function getRepositoryPullRequests(
  owner: string,
  name: string,
  skipCache = false,
): Promise<{ items: ProjectPullRequestFeedItem[]; fetchedAt: number }> {
  const result = await graphql(PULL_REQUESTS_QUERY, { owner, name, skipCache });
  const response = PullRequestsResponseSchema.parse(result.data);

  return {
    fetchedAt: result.fetchedAt,
    items: response.data.repository.pullRequests.nodes,
  };
}

export const PULL_REQUESTS_QUERY = `
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    pullRequests(
      first: 30
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
        comments(first: 20) {
          totalCount
          nodes {
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
