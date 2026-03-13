import { z } from 'zod';

export const GET_APP_BOOTSTRAP_CHANNEL = 'app:get-app-bootstrap';
export const SAVE_REPO_CHANNEL = 'app:save-repo';
export const REMOVE_REPO_CHANNEL = 'app:remove-repo';
export const REORDER_REPOS_CHANNEL = 'app:reorder-repos';
export const PICK_REPO_DIRECTORY_CHANNEL = 'app:pick-repo-directory';
export const GET_WORKSPACE_PREFERENCES_CHANNEL = 'app:get-workspace-preferences';
export const SET_WORKSPACE_PREFERENCES_CHANNEL = 'app:set-workspace-preferences';
export const GET_PROJECT_ISSUES_CHANNEL = 'app:get-project-issues';
export const GET_PROJECT_PULL_REQUESTS_CHANNEL = 'app:get-project-pull-requests';
export const GET_ISSUE_DETAIL_CHANNEL = 'app:get-issue-detail';

export const PROJECT_VIEW_TABS = [
  'code',
  'pull-requests',
  'issues',
  'channels',
] as const;

export const ProjectViewTabSchema = z.enum(PROJECT_VIEW_TABS);
export type ProjectViewTab = (typeof PROJECT_VIEW_TABS)[number];

export const DEFAULT_PROJECT_VIEW_TAB: ProjectViewTab = 'code';

export const RepoSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
});
export type Repo = z.infer<typeof RepoSchema>;

export const GhUserSchema = z.object({
  login: z.string().min(1),
});
export type GhUser = z.infer<typeof GhUserSchema>;

export const AppBootstrapSchema = z.object({
  ghUser: GhUserSchema.nullable(),
  repos: z.array(RepoSchema),
});
export type AppBootstrap = z.infer<typeof AppBootstrapSchema>;

export const WorkspacePreferencesSchema = z.object({
  lastRepoId: z.string().min(1).nullable(),
  lastTab: ProjectViewTabSchema,
});
export type WorkspacePreferences = z.infer<typeof WorkspacePreferencesSchema>;

export const ProjectFeedKindSchema = z.enum(['issues', 'pull-requests']);
export type ProjectFeedKind = z.infer<typeof ProjectFeedKindSchema>;

export const GitHubUserSchema = z.object({
  login: z.string().min(1),
});
export type GitHubUser = z.infer<typeof GitHubUserSchema>;

export const GitHubUserWithAvatarSchema = GitHubUserSchema.extend({
  avatarUrl: z.string().url(),
});
export type GitHubUserWithAvatar = z.infer<typeof GitHubUserWithAvatarSchema>;

export const GitHubLabelSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
});
export type GitHubLabel = z.infer<typeof GitHubLabelSchema>;

export const ProjectFeedItemBaseSchema = z.object({
  id: z.string().min(1),
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
export type ProjectFeedItemBase = z.infer<typeof ProjectFeedItemBaseSchema>;

export const ProjectIssueFeedItemSchema = ProjectFeedItemBaseSchema;
export type ProjectIssueFeedItem = z.infer<typeof ProjectIssueFeedItemSchema>;

export const ProjectPullRequestFeedItemSchema = ProjectFeedItemBaseSchema.extend({
  isDraft: z.boolean(),
  commitCount: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});
export type ProjectPullRequestFeedItem = z.infer<typeof ProjectPullRequestFeedItemSchema>;

const ProjectFeedBaseSchema = z.object({
  githubSlug: z.string().min(1),
  projectPath: z.string().min(1),
  fetchedAt: z.number().int().nonnegative(),
});

export const ProjectIssueFeedSchema = ProjectFeedBaseSchema.extend({
  kind: z.literal('issues'),
  items: z.array(ProjectIssueFeedItemSchema),
});
export type ProjectIssueFeed = z.infer<typeof ProjectIssueFeedSchema>;

export const ProjectPullRequestFeedSchema = ProjectFeedBaseSchema.extend({
  kind: z.literal('pull-requests'),
  items: z.array(ProjectPullRequestFeedItemSchema),
});
export type ProjectPullRequestFeed = z.infer<typeof ProjectPullRequestFeedSchema>;

export const ProjectFeedSchema = z.discriminatedUnion('kind', [
  ProjectIssueFeedSchema,
  ProjectPullRequestFeedSchema,
]);
export type ProjectFeed = z.infer<typeof ProjectFeedSchema>;

export const IssueDetailCommentSchema = z.object({
  id: z.string().min(1),
  bodyHTML: z.string(),
  createdAt: z.string().min(1),
  author: GitHubUserWithAvatarSchema.nullable(),
});
export type IssueDetailComment = z.infer<typeof IssueDetailCommentSchema>;

export const IssueDetailSchema = z.object({
  id: z.string().min(1),
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
export type IssueDetail = z.infer<typeof IssueDetailSchema>;

export interface ElectronApi {
  readonly platform: NodeJS.Platform;
  readonly versions: {
    readonly chrome: string;
    readonly electron: string;
    readonly node: string;
  };
  getAppBootstrap: () => Promise<AppBootstrap>;
  getWorkspacePreferences: () => Promise<WorkspacePreferences>;
  setWorkspacePreferences: (
    preferences: Partial<WorkspacePreferences>,
  ) => Promise<WorkspacePreferences>;
  saveRepo: (path: string) => Promise<Repo>;
  removeRepo: (repoId: string) => Promise<void>;
  reorderRepos: (orderedRepoIds: string[]) => Promise<void>;
  pickRepoDirectory: () => Promise<string | null>;
  getProjectIssues: (projectPath: string, skipCache?: boolean) => Promise<ProjectIssueFeed>;
  getProjectPullRequests: (
    projectPath: string,
    skipCache?: boolean,
  ) => Promise<ProjectPullRequestFeed>;
  getIssueDetail: (projectPath: string, issueNumber: number) => Promise<IssueDetail>;
}
