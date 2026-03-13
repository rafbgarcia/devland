import { z } from 'zod';

export const GET_APP_BOOTSTRAP_CHANNEL = 'app:get-app-bootstrap';
export const PICK_REPO_DIRECTORY_CHANNEL = 'app:pick-repo-directory';
export const GET_PROJECT_ISSUES_CHANNEL = 'app:get-project-issues';
export const GET_PROJECT_PULL_REQUESTS_CHANNEL = 'app:get-project-pull-requests';
export const GET_ISSUE_DETAIL_CHANNEL = 'app:get-issue-detail';
export const VALIDATE_LOCAL_GIT_REPO_CHANNEL = 'app:validate-local-git-repo';
export const GET_GITHUB_REPO_DETAILS_CHANNEL = 'app:get-github-repo-details';
export const APP_SHORTCUT_COMMAND_CHANNEL = 'app:shortcut-command';

export const PROJECT_VIEW_TABS = [
  'code',
  'pull-requests',
  'issues',
  'channels',
] as const;

export const ProjectViewTabSchema = z.enum(PROJECT_VIEW_TABS);
export type ProjectViewTab = (typeof PROJECT_VIEW_TABS)[number];

export const DEFAULT_PROJECT_VIEW_TAB: ProjectViewTab = 'code';

export const APP_SHORTCUT_DIRECTIONS = ['next', 'previous'] as const;
export const AppShortcutDirectionSchema = z.enum(APP_SHORTCUT_DIRECTIONS);
export type AppShortcutDirection = (typeof APP_SHORTCUT_DIRECTIONS)[number];

export const AppShortcutCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('activate-project-tab-by-shortcut-slot'),
    slot: z.number().int().min(1).max(9),
  }),
  z.object({
    type: z.literal('cycle-project-tab'),
    direction: AppShortcutDirectionSchema,
  }),
]);
export type AppShortcutCommand = z.infer<typeof AppShortcutCommandSchema>;

export const RepoSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
});
export type Repo = z.infer<typeof RepoSchema>;

export const GhUserSchema = z.object({
  login: z.string().min(1),
});
export type GhUser = z.infer<typeof GhUserSchema>;

export const WorkspaceSessionSchema = z.object({
  activeRepoId: z.string().min(1).nullable(),
  activeTab: ProjectViewTabSchema,
});
export type WorkspaceSession = z.infer<typeof WorkspaceSessionSchema>;

export const AppBootstrapSchema = z.object({
  ghUser: GhUserSchema.nullable(),
});
export type AppBootstrap = z.infer<typeof AppBootstrapSchema>;

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
  fetchedAt: z.number().int().nonnegative(),
});

export const ProjectIssueFeedSchema = ProjectFeedBaseSchema.extend({
  items: z.array(ProjectIssueFeedItemSchema),
});
export type ProjectIssueFeed = z.infer<typeof ProjectIssueFeedSchema>;

export const ProjectPullRequestFeedSchema = ProjectFeedBaseSchema.extend({
  items: z.array(ProjectPullRequestFeedItemSchema),
});
export type ProjectPullRequestFeed = z.infer<typeof ProjectPullRequestFeedSchema>;

export type ProjectFeed = ProjectIssueFeed | ProjectPullRequestFeed;

export const RepoDetailsSchema = z.object({
  projectPath: z.string().min(1),
  githubSlug: z.string().min(1),
  owner: z.string().min(1),
  name: z.string().min(1),
});
export type RepoDetails = z.infer<typeof RepoDetailsSchema>;

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
  pickRepoDirectory: () => Promise<string | null>;
  getProjectIssues: (
    owner: string,
    name: string,
    skipCache?: boolean,
  ) => Promise<ProjectIssueFeed>;
  getProjectPullRequests: (
    owner: string,
    name: string,
    skipCache?: boolean,
  ) => Promise<ProjectPullRequestFeed>;
  getIssueDetail: (owner: string, name: string, issueNumber: number) => Promise<IssueDetail>;
  validateLocalGitRepository: (directoryPath: string) => Promise<void>;
  getGithubRepoDetails: (projectPath: string) => Promise<RepoDetails>;
  onAppShortcutCommand: (listener: (command: AppShortcutCommand) => void) => () => void;
}
