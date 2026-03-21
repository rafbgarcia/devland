import { z } from 'zod';

import { GitHubLabelSchema, GitHubUserWithAvatarSchema } from './gh-prs.js';

export const IssueCommentSchema = z.object({
  id: z.string().min(1),
  bodyHTML: z.string(),
  createdAt: z.string().min(1),
  author: GitHubUserWithAvatarSchema.nullable(),
});
export type IssueComment = z.infer<typeof IssueCommentSchema>;

export const ProjectIssueFeedItemSchema = z.object({
  id: z.string().min(1),
  number: z.number().int().positive(),
  title: z.string().min(1),
  url: z.string().url(),
  state: z.string().min(1),
  author: GitHubUserWithAvatarSchema.nullable(),
  commentCount: z.number().int().nonnegative(),
  commentAuthors: z.array(GitHubUserWithAvatarSchema.nullable()),
  labels: z.array(GitHubLabelSchema),
  createdAt: z.string().min(1),
  bodyHTML: z.string(),
  comments: z.array(IssueCommentSchema),
});
export type ProjectIssueFeedItem = z.infer<typeof ProjectIssueFeedItemSchema>;

export const ProjectIssueFeedSchema = z.object({
  fetchedAt: z.number().int().nonnegative(),
  items: z.array(ProjectIssueFeedItemSchema),
});
export type ProjectIssueFeed = z.infer<typeof ProjectIssueFeedSchema>;

export const GhIssuesHostMethods = {
  getIssueFeed: 'gh-issues:get-issue-feed',
} as const;

export const GhIssuesGetIssueFeedInputSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  skipCache: z.boolean().optional(),
});
export type GhIssuesGetIssueFeedInput = z.infer<typeof GhIssuesGetIssueFeedInputSchema>;
