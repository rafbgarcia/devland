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
