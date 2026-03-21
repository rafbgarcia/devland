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

export const PrCommitSchema = z.object({
  sha: z.string().min(1),
  shortSha: z.string().min(1),
  title: z.string(),
  body: z.string(),
  authorName: z.string(),
  authorDate: z.string(),
});
export type PrCommit = z.infer<typeof PrCommitSchema>;

export const PrDiffMetaSchema = z.object({
  status: z.literal('ready'),
  baseBranch: z.string().min(1),
  headBranch: z.string().min(1),
  commits: z.array(PrCommitSchema),
  baseRevision: z.string().min(1),
  headRevision: z.string().min(1),
});
export type PrDiffMeta = z.infer<typeof PrDiffMetaSchema>;

export const PrDiffMetaMissingSchema = z.object({
  status: z.literal('missing'),
  reason: z.enum(['missing-snapshot', 'missing-refs']),
  message: z.string().min(1),
});
export type PrDiffMetaMissing = z.infer<typeof PrDiffMetaMissingSchema>;

export const PrDiffMetaResultSchema = z.discriminatedUnion('status', [
  PrDiffMetaSchema,
  PrDiffMetaMissingSchema,
]);
export type PrDiffMetaResult = z.infer<typeof PrDiffMetaResultSchema>;

export const PrReviewStepSchema = z.object({
  order: z.number().int().positive(),
  description: z.string().min(1),
  relevantChanges: z.array(z.string().min(1)),
});
export type PrReviewStep = z.infer<typeof PrReviewStepSchema>;

export const PrReviewSchema = z.object({
  steps: z.array(PrReviewStepSchema),
  fileDiffs: z.record(z.string(), z.string()),
  durationMs: z.number().int().nonnegative(),
});
export type PrReview = z.infer<typeof PrReviewSchema>;

export const CreateGitHubPrReviewThreadInputSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  prNumber: z.number().int().positive(),
  path: z.string().min(1),
  body: z.string().min(1),
  line: z.number().int().positive(),
  side: z.enum(['LEFT', 'RIGHT']),
  startLine: z.number().int().positive().nullable().optional(),
  startSide: z.enum(['LEFT', 'RIGHT']).nullable().optional(),
});
export type CreateGitHubPrReviewThreadInput = z.infer<typeof CreateGitHubPrReviewThreadInputSchema>;

export const CreateGitHubPrReviewThreadResultSchema = z.object({
  reviewId: z.string().min(1),
});
export type CreateGitHubPrReviewThreadResult = z.infer<typeof CreateGitHubPrReviewThreadResultSchema>;

export const GhPrsHostMethods = {
  getPullRequestFeed: 'gh-prs:get-pull-request-feed',
  syncReviewRefs: 'gh-prs:sync-review-refs',
  getPrDiffMeta: 'gh-prs:get-pr-diff-meta',
  generatePrReview: 'gh-prs:generate-pr-review',
  createReviewThread: 'gh-prs:create-review-thread',
  getCommitDiff: 'gh-prs:get-commit-diff',
  getPrDiff: 'gh-prs:get-pr-diff',
  getCommitParent: 'gh-prs:get-commit-parent',
  getGitBlobText: 'gh-prs:get-git-blob-text',
  getWorkingTreeFileText: 'gh-prs:get-working-tree-file-text',
  cloneRepo: 'gh-prs:clone-repo',
} as const;

export const GhPrsGetPullRequestFeedInputSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  skipCache: z.boolean().optional(),
});
export type GhPrsGetPullRequestFeedInput = z.infer<typeof GhPrsGetPullRequestFeedInputSchema>;

export const GhPrsSyncReviewRefsInputSchema = z.object({
  repoPath: z.string().min(1),
  owner: z.string().min(1),
  name: z.string().min(1),
});
export type GhPrsSyncReviewRefsInput = z.infer<typeof GhPrsSyncReviewRefsInputSchema>;

export const GhPrsGetPrDiffMetaInputSchema = z.object({
  repoPath: z.string().min(1),
  prNumber: z.number().int().positive(),
});
export type GhPrsGetPrDiffMetaInput = z.infer<typeof GhPrsGetPrDiffMetaInputSchema>;

export const GhPrsGeneratePrReviewInputSchema = z.object({
  repoPath: z.string().min(1),
  prNumber: z.number().int().positive(),
  title: z.string().min(1),
});
export type GhPrsGeneratePrReviewInput = z.infer<typeof GhPrsGeneratePrReviewInputSchema>;

export const GhPrsGetCommitDiffInputSchema = z.object({
  repoPath: z.string().min(1),
  commitSha: z.string().min(1),
});
export type GhPrsGetCommitDiffInput = z.infer<typeof GhPrsGetCommitDiffInputSchema>;

export const GhPrsGetPrDiffInputSchema = z.object({
  repoPath: z.string().min(1),
  prNumber: z.number().int().positive(),
});
export type GhPrsGetPrDiffInput = z.infer<typeof GhPrsGetPrDiffInputSchema>;

export const GhPrsGetCommitParentInputSchema = z.object({
  repoPath: z.string().min(1),
  commitSha: z.string().min(1),
});
export type GhPrsGetCommitParentInput = z.infer<typeof GhPrsGetCommitParentInputSchema>;

export const GhPrsGetGitBlobTextInputSchema = z.object({
  repoPath: z.string().min(1),
  revision: z.string().min(1),
  filePath: z.string().min(1),
  maxBytes: z.number().int().positive().optional(),
});
export type GhPrsGetGitBlobTextInput = z.infer<typeof GhPrsGetGitBlobTextInputSchema>;

export const GhPrsGetWorkingTreeFileTextInputSchema = z.object({
  repoPath: z.string().min(1),
  filePath: z.string().min(1),
  maxBytes: z.number().int().positive().optional(),
});
export type GhPrsGetWorkingTreeFileTextInput = z.infer<typeof GhPrsGetWorkingTreeFileTextInputSchema>;

export const GhPrsCloneRepoInputSchema = z.object({
  repoId: z.string().min(1),
  slug: z.string().min(1),
});
export type GhPrsCloneRepoInput = z.infer<typeof GhPrsCloneRepoInputSchema>;

export const GhPrsCloneRepoResultSchema = z.object({
  path: z.string().min(1),
});
export type GhPrsCloneRepoResult = z.infer<typeof GhPrsCloneRepoResultSchema>;
