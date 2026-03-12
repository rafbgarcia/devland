export const GET_APP_BOOTSTRAP_CHANNEL = 'app:get-app-bootstrap';
export const SAVE_REPO_CHANNEL = 'app:save-repo';
export const REMOVE_REPO_CHANNEL = 'app:remove-repo';
export const REORDER_REPOS_CHANNEL = 'app:reorder-repos';
export const PICK_REPO_DIRECTORY_CHANNEL = 'app:pick-repo-directory';
export const GET_WORKSPACE_PREFERENCES_CHANNEL = 'app:get-workspace-preferences';
export const SET_WORKSPACE_PREFERENCES_CHANNEL = 'app:set-workspace-preferences';
export const GET_PROJECT_ISSUES_CHANNEL = 'app:get-project-issues';
export const GET_PROJECT_PULL_REQUESTS_CHANNEL = 'app:get-project-pull-requests';

export const PROJECT_VIEW_TABS = [
  'code',
  'pull-requests',
  'issues',
  'channels',
] as const;

export type ProjectViewTab = (typeof PROJECT_VIEW_TABS)[number];

export const DEFAULT_PROJECT_VIEW_TAB: ProjectViewTab = 'code';

export type Repo = {
  id: string;
  path: string;
};

export type GhUser = {
  login: string;
};

export type AppBootstrap = {
  ghUser: GhUser | null;
  repos: Repo[];
};

export type WorkspacePreferences = {
  lastRepoId: string | null;
  lastTab: ProjectViewTab;
};

export type ProjectFeedKind = 'issues' | 'pull-requests';

export type ProjectFeedLabel = {
  name: string;
  color: string;
};

export type ProjectFeedItemBase = {
  id: string;
  number: number;
  title: string;
  url: string;
  state: string;
  authorLogin: string;
  commentCount: number;
  commentAuthors: string[];
  labels: ProjectFeedLabel[];
  createdAt: string;
};

export type ProjectIssueFeedItem = ProjectFeedItemBase;

export type ProjectPullRequestFeedItem = ProjectFeedItemBase & {
  isDraft: boolean;
  commitCount: number;
  additions: number;
  deletions: number;
};

type ProjectFeedBase<TItem> = {
  kind: ProjectFeedKind;
  githubSlug: string;
  projectPath: string;
  fetchedAt: number;
  items: TItem[];
};

export type ProjectIssueFeed = ProjectFeedBase<ProjectIssueFeedItem> & {
  kind: 'issues';
};

export type ProjectPullRequestFeed = ProjectFeedBase<ProjectPullRequestFeedItem> & {
  kind: 'pull-requests';
};

export type ProjectFeed = ProjectIssueFeed | ProjectPullRequestFeed;

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
}
