import { z } from 'zod';

import {
  GitHubLabelSchema,
  GitHubUserWithAvatarSchema,
  IssueDetailCommentSchema,
  IssueDetailSchema,
  type IssueDetail,
} from '../../ipc/contracts';
import { graphql } from '../gh-graphql';

const GitHubNodeIdSchema = z.union([z.string(), z.number()]).transform(String);

const IssueDetailCommentResponseSchema = IssueDetailCommentSchema.extend({
  id: GitHubNodeIdSchema,
});

const IssueDetailResponseNodeSchema = z
  .object({
    id: GitHubNodeIdSchema,
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
      nodes: z.array(IssueDetailCommentResponseSchema),
    }),
    createdAt: z.string().min(1),
  })
  .transform(({ comments, labels, ...issue }) => ({
    ...issue,
    labels: labels.nodes,
    comments: comments.nodes,
    commentCount: comments.totalCount,
  }))
  .pipe(IssueDetailSchema);

const IssueDetailResponseSchema = z.object({
  data: z.object({
    repository: z.object({
      issue: IssueDetailResponseNodeSchema,
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

  return response.data.repository.issue;
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
