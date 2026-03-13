import { z } from 'zod';

import type { IssueDetail } from '../../ipc/contracts';
import { graphql } from '../gh-graphql';

const GitHubUserWithAvatarSchema = z.object({
  login: z.string().min(1),
  avatarUrl: z.string().url(),
});

const GitHubLabelSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
});

const IssueDetailCommentSchema = z.object({
  id: z.string(),
  bodyHTML: z.string(),
  createdAt: z.string().min(1),
  author: GitHubUserWithAvatarSchema.nullable(),
});

const IssueDetailSchema: z.ZodType<IssueDetail> = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  title: z.string().min(1),
  url: z.string().url(),
  state: z.string().min(1),
  bodyHTML: z.string(),
  author: GitHubUserWithAvatarSchema.nullable(),
  labels: z.array(GitHubLabelSchema),
  comments: z.array(IssueDetailCommentSchema),
  commentCount: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
});

const IssueDetailResponseSchema = z.object({
  data: z.object({
    repository: z.object({
      issue: z.object({
        id: z.union([z.string(), z.number()]),
        number: z.number().int().positive(),
        title: z.string().min(1),
        url: z.string().url(),
        state: z.string().min(1),
        bodyHTML: z.string(),
        author: GitHubUserWithAvatarSchema.nullable(),
        labels: z.object({
          nodes: z.array(GitHubLabelSchema),
        }),
        comments: z.object({
          totalCount: z.number().int().nonnegative(),
          nodes: z.array(
            z.object({
              id: z.union([z.string(), z.number()]),
              bodyHTML: z.string(),
              createdAt: z.string().min(1),
              author: GitHubUserWithAvatarSchema.nullable(),
            }),
          ),
        }),
        createdAt: z.string().min(1),
      }),
    }),
  }),
});

export async function getRepositoryIssueDetail(
  owner: string,
  name: string,
  issueNumber: number,
): Promise<IssueDetail> {
  const result = await graphql(ISSUE_DETAIL_QUERY, {
    owner,
    name,
    skipCache: true,
    variables: { number: issueNumber },
  });
  const response = IssueDetailResponseSchema.parse(result.data);
  const issue = response.data.repository.issue;

  return IssueDetailSchema.parse({
    id: String(issue.id),
    number: issue.number,
    title: issue.title,
    url: issue.url,
    state: issue.state,
    bodyHTML: issue.bodyHTML,
    author: issue.author,
    labels: issue.labels.nodes,
    comments: issue.comments.nodes.map((comment) => ({
      id: String(comment.id),
      bodyHTML: comment.bodyHTML,
      createdAt: comment.createdAt,
      author: comment.author,
    })),
    commentCount: issue.comments.totalCount,
    createdAt: issue.createdAt,
  });
}

export const ISSUE_DETAIL_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      id
      number
      title
      url
      state
      bodyHTML
      author {
        login
        avatarUrl
      }
      labels(first: 10) {
        nodes {
          name
          color
        }
      }
      comments(first: 50) {
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
      createdAt
    }
  }
}
`.replace(/\n\s*/g, ' ').trim();
