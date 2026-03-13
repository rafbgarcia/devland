import { z } from 'zod';

import {
  GitHubLabelSchema,
  GitHubUserWithAvatarSchema,
  PullRequestDetailCommentSchema,
  PullRequestDetailSchema,
  type PullRequestDetail,
} from '../../ipc/contracts';
import { graphql } from '../gh-graphql';

const GitHubNodeIdSchema = z.union([z.string(), z.number()]).transform(String);

const PullRequestDetailCommentResponseSchema = PullRequestDetailCommentSchema.extend({
  id: GitHubNodeIdSchema,
});

const PullRequestDetailResponseNodeSchema = z
  .object({
    id: GitHubNodeIdSchema,
    number: z.number().int().positive(),
    title: z.string().min(1),
    url: z.string().url(),
    state: z.string().min(1),
    isDraft: z.boolean(),
    bodyHTML: z.string(),
    author: GitHubUserWithAvatarSchema.nullable(),
    labels: z.object({
      nodes: z.array(GitHubLabelSchema),
    }),
    comments: z.object({
      totalCount: z.number().int().nonnegative(),
      nodes: z.array(PullRequestDetailCommentResponseSchema),
    }),
    commits: z.object({
      totalCount: z.number().int().nonnegative(),
    }),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    createdAt: z.string().min(1),
  })
  .transform(({ comments, commits, labels, ...pr }) => ({
    ...pr,
    labels: labels.nodes,
    comments: comments.nodes,
    commentCount: comments.totalCount,
    commitCount: commits.totalCount,
  }))
  .pipe(PullRequestDetailSchema);

const PullRequestDetailResponseSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: PullRequestDetailResponseNodeSchema,
    }),
  }),
});

export async function getRepositoryPullRequestDetail(
  owner: string,
  name: string,
  prNumber: number,
): Promise<PullRequestDetail> {
  const result = await graphql(PULL_REQUEST_DETAIL_QUERY, {
    owner,
    name,
    skipCache: true,
    variables: { number: prNumber },
  });
  const response = PullRequestDetailResponseSchema.parse(result.data);

  return response.data.repository.pullRequest;
}

export const PULL_REQUEST_DETAIL_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      number
      title
      url
      state
      isDraft
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
      commits {
        totalCount
      }
      additions
      deletions
      createdAt
    }
  }
}
`.replace(/\n\s*/g, ' ').trim();
