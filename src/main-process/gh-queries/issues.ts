import { z } from 'zod';

import {
  GitHubLabelSchema,
  GitHubUserSchema,
  ProjectIssueFeedItemSchema,
  type ProjectIssueFeedItem,
} from '../../ipc/contracts';
import { graphql } from '../gh-graphql';

const GitHubNodeIdSchema = z.union([z.string(), z.number()]).transform(String);

const IssueCommentAuthorSchema = z.object({
  author: GitHubUserSchema.nullable(),
});

const IssueResponseNodeSchema = z
  .object({
    id: GitHubNodeIdSchema,
    number: z.number().int().positive(),
    title: z.string().min(1),
    url: z.string().url(),
    state: z.string().min(1),
    author: GitHubUserSchema.nullable(),
    comments: z.object({
      totalCount: z.number().int().nonnegative(),
      nodes: z.array(IssueCommentAuthorSchema),
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

export async function getRepositoryIssues(
  owner: string,
  name: string,
  skipCache = false,
): Promise<{ items: ProjectIssueFeedItem[]; fetchedAt: number }> {
  const result = await graphql(ISSUES_QUERY, { owner, name, skipCache });
  const response = IssuesResponseSchema.parse(result.data);

  return {
    fetchedAt: result.fetchedAt,
    items: response.data.repository.issues.nodes,
  };
}

export const ISSUES_QUERY = `
query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    issues(
      first: 30
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
      }
    }
  }
}
`.replace(/\n\s*/g, ' ').trim();
