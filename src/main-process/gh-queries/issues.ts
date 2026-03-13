import { z } from 'zod';

import type { ProjectIssueFeedItem } from '../../ipc/contracts';
import { graphql } from '../gh-graphql';

const GitHubUserSchema = z.object({
  login: z.string().min(1),
});

const GitHubLabelSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
});

const IssueCommentAuthorSchema = z.object({
  author: GitHubUserSchema.nullable(),
});

const ProjectIssueFeedItemSchema: z.ZodType<ProjectIssueFeedItem> = z.object({
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
});

const IssuesResponseSchema = z.object({
  data: z.object({
    repository: z.object({
      issues: z.object({
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
              nodes: z.array(IssueCommentAuthorSchema),
            }),
            labels: z.object({
              nodes: z.array(GitHubLabelSchema),
            }),
            createdAt: z.string().min(1),
          }),
        ),
      }),
    }),
  }),
});

export async function getRepositoryIssues(
  owner: string,
  name: string,
  skipCache = false,
): Promise<ProjectIssueFeedItem[]> {
  const response = IssuesResponseSchema.parse(
    await graphql(ISSUES_QUERY, { owner, name, skipCache }),
  );

  return response.data.repository.issues.nodes.map((node) =>
    ProjectIssueFeedItemSchema.parse({
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
    }),
  );
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
