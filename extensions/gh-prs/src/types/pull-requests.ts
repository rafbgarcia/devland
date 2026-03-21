import { z } from 'zod';

export const GitHubUserWithAvatarSchema = z.object({
  login: z.string().min(1),
  avatarUrl: z.string().url(),
});
export type GitHubUserWithAvatar = z.infer<typeof GitHubUserWithAvatarSchema>;

export const GitHubLabelSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
});
export type GitHubLabel = z.infer<typeof GitHubLabelSchema>;

export const PullRequestCommentSchema = z.object({
  id: z.string().min(1),
  bodyHTML: z.string(),
  createdAt: z.string().min(1),
  author: GitHubUserWithAvatarSchema.nullable(),
});
export type PullRequestComment = z.infer<typeof PullRequestCommentSchema>;

export const ProjectPullRequestFeedItemSchema = z.object({
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
  isDraft: z.boolean(),
  bodyHTML: z.string(),
  comments: z.array(PullRequestCommentSchema),
  commitCount: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});
export type ProjectPullRequestFeedItem = z.infer<typeof ProjectPullRequestFeedItemSchema>;

export const ProjectPullRequestFeedSchema = z.object({
  fetchedAt: z.number().int().nonnegative(),
  items: z.array(ProjectPullRequestFeedItemSchema),
});
export type ProjectPullRequestFeed = z.infer<typeof ProjectPullRequestFeedSchema>;
