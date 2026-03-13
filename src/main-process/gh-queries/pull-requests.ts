import { z } from 'zod';

import type { ProjectPullRequestFeedItem } from '../../ipc/contracts';
import { graphql } from '../gh-graphql';

const GitHubUserSchema = z.object({
  login: z.string().min(1),
});

const GitHubLabelSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
});

const PullRequestCommentAuthorSchema = z.object({
  author: GitHubUserSchema.nullable(),
});

const ProjectPullRequestFeedItemSchema: z.ZodType<ProjectPullRequestFeedItem> = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  title: z.string().min(1),
  url: z.string().url(),
  state: z.string().min(1),
  author: GitHubUserSchema.nullable(),
  commentCount: z.number().int().nonnegative(),
  commentAuthors: z.array(GitHubUserSchema.nullable()),
  labels: z.array(GitHubLabelSchema),
  createdAt: z.string().min(1),
  isDraft: z.boolean(),
  commitCount: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});

const PullRequestsResponseSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequests: z.object({
        nodes: z.array(
          z.object({
            id: z.union([z.string(), z.number()]),
            number: z.number().int().positive(),
            title: z.string().min(1),
            url: z.string().url(),
            state: z.string().min(1),
            author: GitHubUserSchema.nullable(),
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
          }),
        ),
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
    items: response.data.repository.pullRequests.nodes.map((node) =>
      ProjectPullRequestFeedItemSchema.parse({
        id: String(node.id),
        number: node.number,
        title: node.title,
        url: node.url,
        state: node.state,
        author: node.author,
        commentCount: node.comments.totalCount,
        commentAuthors: node.comments.nodes.map((comment) => comment.author),
        labels: node.labels.nodes,
        createdAt: node.createdAt,
        isDraft: node.isDraft,
        commitCount: node.commits.totalCount,
        additions: node.additions,
        deletions: node.deletions,
      }),
    ),
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
        }
        comments(first: 20) {
          totalCount
          nodes {
            author {
              login
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
