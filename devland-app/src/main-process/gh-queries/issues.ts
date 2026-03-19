import { z } from 'zod';

import {
  GitHubLabelSchema,
  GitHubUserWithAvatarSchema,
  IssueCommentSchema,
  ProjectIssueFeedItemSchema,
  type ProjectIssueFeedItem,
} from '../../ipc/contracts';
import { graphql } from '../gh-graphql';

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
