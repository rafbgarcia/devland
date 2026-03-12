export const GET_APP_BOOTSTRAP_CHANNEL = 'app:get-app-bootstrap';
export const SAVE_REPO_CHANNEL = 'app:save-repo';
export const REMOVE_REPO_CHANNEL = 'app:remove-repo';
export const REORDER_REPOS_CHANNEL = 'app:reorder-repos';
export const PICK_REPO_DIRECTORY_CHANNEL = 'app:pick-repo-directory';
export const GET_PROJECT_ISSUES_CHANNEL = 'app:get-project-issues';
export const GET_PROJECT_PULL_REQUESTS_CHANNEL = 'app:get-project-pull-requests';

export type Repo = {
  path: string;
};

export type GhUser = {
  login: string;
};

export type AppBootstrap = {
  ghUser: GhUser | null;
  repos: Repo[];
};

export type ProjectFeedKind = 'issues' | 'pull-requests';

export type ProjectFeedLabel = {
  name: string;
  color: string;
};

export type ProjectFeedItem = {
  id: string;
  number: number;
  title: string;
  url: string;
  state: string;
  authorLogin: string;
  commentCount: number;
  commentAuthors: string[];
  labels: ProjectFeedLabel[];
  updatedAt: string;
  commitCount?: number;
  additions?: number;
  deletions?: number;
};

export type ProjectFeed = {
  githubSlug: string;
  projectPath: string;
  fetchedAt: number;
  items: ProjectFeedItem[];
};

export interface ElectronApi {
  readonly platform: NodeJS.Platform;
  readonly versions: {
    readonly chrome: string;
    readonly electron: string;
    readonly node: string;
  };
  getAppBootstrap: () => Promise<AppBootstrap>;
  saveRepo: (path: string) => Promise<Repo>;
  removeRepo: (path: string) => Promise<void>;
  reorderRepos: (orderedPaths: string[]) => Promise<void>;
  pickRepoDirectory: () => Promise<string | null>;
  getProjectIssues: (projectPath: string, skipCache?: boolean) => Promise<ProjectFeed>;
  getProjectPullRequests: (projectPath: string, skipCache?: boolean) => Promise<ProjectFeed>;
}
