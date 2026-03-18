import { z } from 'zod';

import type {
  CodexComposerSettings,
  CodexImageAttachmentInput,
} from '@/lib/codex-chat';

export const GET_APP_BOOTSTRAP_CHANNEL = 'app:get-app-bootstrap';
export const PICK_REPO_DIRECTORY_CHANNEL = 'app:pick-repo-directory';
export const GET_PROJECT_ISSUES_CHANNEL = 'app:get-project-issues';
export const GET_PROJECT_PULL_REQUESTS_CHANNEL = 'app:get-project-pull-requests';
export const VALIDATE_LOCAL_GIT_REPO_CHANNEL = 'app:validate-local-git-repo';
export const GET_GITHUB_REPO_DETAILS_CHANNEL = 'app:get-github-repo-details';
export const FIND_LOCAL_GITHUB_REPO_CHANNEL = 'app:find-local-github-repo';
export const APP_SHORTCUT_COMMAND_CHANNEL = 'app:shortcut-command';
export const CLONE_GITHUB_REPO_CHANNEL = 'app:clone-github-repo';
export const CLONE_GITHUB_REPO_PROGRESS_CHANNEL = 'app:clone-github-repo-progress';
export const GET_GIT_BRANCHES_CHANNEL = 'app:get-git-branches';
export const GET_GIT_DEFAULT_BRANCH_CHANNEL = 'app:get-git-default-branch';
export const GET_GIT_BRANCH_HISTORY_CHANNEL = 'app:get-git-branch-history';
export const START_GIT_STATE_WATCH_CHANNEL = 'app:start-git-state-watch';
export const STOP_GIT_STATE_WATCH_CHANNEL = 'app:stop-git-state-watch';
export const GIT_STATE_CHANGED_CHANNEL = 'app:git-state-changed';
export const GET_GIT_BRANCH_COMPARE_META_CHANNEL = 'app:get-git-branch-compare-meta';
export const GET_GIT_BRANCH_COMPARE_DIFF_CHANNEL = 'app:get-git-branch-compare-diff';
export const GET_GIT_STATUS_CHANNEL = 'app:get-git-status';
export const GET_GIT_WORKING_TREE_DIFF_CHANNEL = 'app:get-git-working-tree-diff';
export const CHECKOUT_GIT_BRANCH_CHANNEL = 'app:checkout-git-branch';
export const GET_GIT_FILE_DIFF_CHANNEL = 'app:get-git-file-diff';
export const CREATE_GIT_WORKTREE_CHANNEL = 'app:create-git-worktree';
export const PROMOTE_GIT_WORKTREE_BRANCH_CHANNEL = 'app:promote-git-worktree-branch';
export const COMMIT_WORKING_TREE_SELECTION_CHANNEL = 'app:commit-working-tree-selection';
export const GENERATE_PR_REVIEW_CHANNEL = 'app:generate-pr-review';
export const SYNC_REPO_REVIEW_REFS_CHANNEL = 'app:sync-repo-review-refs';
export const CREATE_GITHUB_PR_REVIEW_THREAD_CHANNEL = 'app:create-github-pr-review-thread';
export const SEND_CODEX_SESSION_PROMPT_CHANNEL = 'app:send-codex-session-prompt';
export const LIST_CODEX_THREADS_CHANNEL = 'app:list-codex-threads';
export const RESUME_CODEX_THREAD_CHANNEL = 'app:resume-codex-thread';
export const SEARCH_CODEX_PATHS_CHANNEL = 'app:search-codex-paths';
export const INTERRUPT_CODEX_SESSION_CHANNEL = 'app:interrupt-codex-session';
export const STOP_CODEX_SESSION_CHANNEL = 'app:stop-codex-session';
export const RESPOND_TO_CODEX_APPROVAL_CHANNEL = 'app:respond-to-codex-approval';
export const RESPOND_TO_CODEX_USER_INPUT_CHANNEL = 'app:respond-to-codex-user-input';
export const CODEX_SESSION_EVENT_CHANNEL = 'app:codex-session-event';
export const OPEN_TERMINAL_SESSION_CHANNEL = 'app:open-terminal-session';
export const WRITE_TERMINAL_SESSION_CHANNEL = 'app:write-terminal-session';
export const RESIZE_TERMINAL_SESSION_CHANNEL = 'app:resize-terminal-session';
export const CLOSE_TERMINAL_SESSION_CHANNEL = 'app:close-terminal-session';
export const TERMINAL_SESSION_EVENT_CHANNEL = 'app:terminal-session-event';
export const SHOW_BROWSER_VIEW_CHANNEL = 'app:show-browser-view';
export const HIDE_BROWSER_VIEW_CHANNEL = 'app:hide-browser-view';
export const UPDATE_BROWSER_VIEW_BOUNDS_CHANNEL = 'app:update-browser-view-bounds';
export const NAVIGATE_BROWSER_VIEW_CHANNEL = 'app:navigate-browser-view';
export const GO_BACK_BROWSER_VIEW_CHANNEL = 'app:go-back-browser-view';
export const GO_FORWARD_BROWSER_VIEW_CHANNEL = 'app:go-forward-browser-view';
export const RELOAD_BROWSER_VIEW_CHANNEL = 'app:reload-browser-view';
export const OPEN_BROWSER_VIEW_DEVTOOLS_CHANNEL = 'app:open-browser-view-devtools';
export const DISPOSE_BROWSER_VIEW_CHANNEL = 'app:dispose-browser-view';
export const BROWSER_VIEW_EVENT_CHANNEL = 'app:browser-view-event';
export const GET_PR_DIFF_META_CHANNEL = 'app:get-pr-diff-meta';
export const GET_COMMIT_DIFF_CHANNEL = 'app:get-commit-diff';
export const GET_PR_DIFF_CHANNEL = 'app:get-pr-diff';
export const GET_GIT_BLOB_TEXT_CHANNEL = 'app:get-git-blob-text';
export const GET_WORKING_TREE_FILE_TEXT_CHANNEL = 'app:get-working-tree-file-text';
export const GET_COMMIT_PARENT_CHANNEL = 'app:get-commit-parent';

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

export const CODEX_PATH_SEARCH_SCOPES = ['current', 'global'] as const;
export const CodexPathSearchScopeSchema = z.enum(CODEX_PATH_SEARCH_SCOPES);
export type CodexPathSearchScope = z.infer<typeof CodexPathSearchScopeSchema>;

export const CodexPathSearchInputSchema = z.object({
  cwd: z.string().min(1),
  scope: CodexPathSearchScopeSchema,
  query: z.string().max(256),
  limit: z.number().int().min(1).max(200),
  storedRepoPaths: z.array(z.string().min(1)),
});
export type CodexPathSearchInput = z.infer<typeof CodexPathSearchInputSchema>;

export const CodexPathSearchResultItemSchema = z.object({
  scope: CodexPathSearchScopeSchema,
  repoPath: z.string().min(1),
  repoLabel: z.string().min(1),
  relativePath: z.string().min(1),
  absolutePath: z.string().min(1),
});
export type CodexPathSearchResultItem = z.infer<typeof CodexPathSearchResultItemSchema>;

export const CodexPathSearchResultSchema = z.object({
  items: z.array(CodexPathSearchResultItemSchema),
  truncated: z.boolean(),
});
export type CodexPathSearchResult = z.infer<typeof CodexPathSearchResultSchema>;

export const CodexThreadSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).nullable(),
  preview: z.string(),
  cwd: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type CodexThreadSummary = z.infer<typeof CodexThreadSummarySchema>;

export const ListCodexThreadsInputSchema = z.object({
  cwd: z.string().min(1),
  limit: z.number().int().positive().max(100).optional(),
});
export type ListCodexThreadsInput = z.infer<typeof ListCodexThreadsInputSchema>;

export const CodexResumedThreadMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  createdAt: z.string().min(1),
  completedAt: z.string().min(1).nullable(),
  turnId: z.string().min(1).nullable(),
  itemId: z.string().min(1).nullable(),
});
export type CodexResumedThreadMessage = z.infer<typeof CodexResumedThreadMessageSchema>;

export const CodexResumedThreadSchema = z.object({
  threadId: z.string().min(1),
  messages: z.array(CodexResumedThreadMessageSchema),
});
export type CodexResumedThread = z.infer<typeof CodexResumedThreadSchema>;

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
  author: GitHubUserWithAvatarSchema.nullable(),
  commentCount: z.number().int().nonnegative(),
  commentAuthors: z.array(GitHubUserWithAvatarSchema.nullable()),
  labels: z.array(GitHubLabelSchema),
  createdAt: z.string().min(1),
});
export type ProjectFeedItemBase = z.infer<typeof ProjectFeedItemBaseSchema>;

export const IssueCommentSchema = z.object({
  id: z.string().min(1),
  bodyHTML: z.string(),
  createdAt: z.string().min(1),
  author: GitHubUserWithAvatarSchema.nullable(),
});
export type IssueComment = z.infer<typeof IssueCommentSchema>;

export const ProjectIssueFeedItemSchema = ProjectFeedItemBaseSchema.extend({
  bodyHTML: z.string(),
  comments: z.array(IssueCommentSchema),
});
export type ProjectIssueFeedItem = z.infer<typeof ProjectIssueFeedItemSchema>;

export const PullRequestCommentSchema = z.object({
  id: z.string().min(1),
  bodyHTML: z.string(),
  createdAt: z.string().min(1),
  author: GitHubUserWithAvatarSchema.nullable(),
});
export type PullRequestComment = z.infer<typeof PullRequestCommentSchema>;

export const ProjectPullRequestFeedItemSchema = ProjectFeedItemBaseSchema.extend({
  isDraft: z.boolean(),
  bodyHTML: z.string(),
  comments: z.array(PullRequestCommentSchema),
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

export const GIT_FILE_STATUSES = [
  'modified',
  'added',
  'deleted',
  'renamed',
  'untracked',
] as const;

export const GitFileStatusSchema = z.enum(GIT_FILE_STATUSES);
export type GitFileStatus = z.infer<typeof GitFileStatusSchema>;

export const GitBranchSchema = z.object({
  name: z.string().min(1),
  isCurrent: z.boolean(),
});
export type GitBranch = z.infer<typeof GitBranchSchema>;

export const GitStatusFileSchema = z.object({
  path: z.string().min(1),
  oldPath: z.string().min(1).nullable().optional(),
  status: GitFileStatusSchema,
  hasStagedChanges: z.boolean(),
  hasUnstagedChanges: z.boolean(),
});
export type GitStatusFile = z.infer<typeof GitStatusFileSchema>;

export const GitStatusSchema = z.object({
  branch: z.string(),
  headRevision: z.string().min(1).nullable(),
  files: z.array(GitStatusFileSchema),
  hasStagedChanges: z.boolean(),
});
export type GitStatus = z.infer<typeof GitStatusSchema>;

export const GitStateChangedEventSchema = z.object({
  repoPath: z.string().min(1),
});
export type GitStateChangedEvent = z.infer<typeof GitStateChangedEventSchema>;

export const CODE_TARGET_KINDS = ['root', 'session', 'worktree'] as const;
export const CodeTargetKindSchema = z.enum(CODE_TARGET_KINDS);
export type CodeTargetKind = z.infer<typeof CodeTargetKindSchema>;

export const CodeTargetSchema = z.object({
  id: z.string().min(1),
  repoId: z.string().min(1),
  kind: CodeTargetKindSchema,
  cwd: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.string().min(1),
});
export type CodeTarget = z.infer<typeof CodeTargetSchema>;

export const CreateGitWorktreeResultSchema = z.object({
  cwd: z.string().min(1),
  branch: z.string().min(1),
});
export type CreateGitWorktreeResult = z.infer<typeof CreateGitWorktreeResultSchema>;

export const PromoteGitWorktreeBranchResultSchema = z.object({
  branch: z.string().min(1),
});
export type PromoteGitWorktreeBranchResult = z.infer<typeof PromoteGitWorktreeBranchResultSchema>;

export const CommitWorkingTreeSelectionFileSchema = z.object({
  path: z.string().min(1),
  paths: z.array(z.string().min(1)).min(1),
  kind: z.enum(['full', 'partial']),
  patch: z.string().min(1).nullable().optional(),
});
export type CommitWorkingTreeSelectionFile = z.infer<typeof CommitWorkingTreeSelectionFileSchema>;

export const CommitWorkingTreeSelectionInputSchema = z.object({
  repoPath: z.string().min(1),
  summary: z.string().min(1),
  description: z.string().default(''),
  files: z.array(CommitWorkingTreeSelectionFileSchema).min(1),
});
export type CommitWorkingTreeSelectionInput = z.infer<typeof CommitWorkingTreeSelectionInputSchema>;

export const CommitWorkingTreeSelectionResultSchema = z.object({
  commitSha: z.string().min(1),
});
export type CommitWorkingTreeSelectionResult = z.infer<typeof CommitWorkingTreeSelectionResultSchema>;

export const GitHubPullRequestReviewThreadSideSchema = z.enum(['LEFT', 'RIGHT']);
export type GitHubPullRequestReviewThreadSide = z.infer<typeof GitHubPullRequestReviewThreadSideSchema>;

export const CreateGitHubPrReviewThreadInputSchema = z.object({
  owner: z.string().min(1),
  name: z.string().min(1),
  prNumber: z.number().int().positive(),
  path: z.string().min(1),
  body: z.string().min(1),
  line: z.number().int().positive(),
  side: GitHubPullRequestReviewThreadSideSchema,
  startLine: z.number().int().positive().nullable().optional(),
  startSide: GitHubPullRequestReviewThreadSideSchema.nullable().optional(),
});
export type CreateGitHubPrReviewThreadInput = z.infer<typeof CreateGitHubPrReviewThreadInputSchema>;

export const CreateGitHubPrReviewThreadResultSchema = z.object({
  reviewId: z.string().min(1),
});
export type CreateGitHubPrReviewThreadResult = z.infer<typeof CreateGitHubPrReviewThreadResultSchema>;

export const CodexSessionStatusSchema = z.enum([
  'connecting',
  'ready',
  'running',
  'error',
  'closed',
]);
export type CodexSessionStatus = z.infer<typeof CodexSessionStatusSchema>;

export const CodexApprovalKindSchema = z.enum([
  'command',
  'file-change',
  'permissions',
  'generic',
]);
export type CodexApprovalKind = z.infer<typeof CodexApprovalKindSchema>;

export const CodexApprovalDecisionSchema = z.enum(['accept', 'acceptForSession', 'decline', 'cancel']);
export type CodexApprovalDecision = z.infer<typeof CodexApprovalDecisionSchema>;
export const CODEX_ACTIVITY_PHASES = ['started', 'updated', 'completed', 'instant'] as const;
export const CodexActivityPhaseSchema = z.enum(CODEX_ACTIVITY_PHASES);
export type CodexActivityPhase = z.infer<typeof CodexActivityPhaseSchema>;

export const CodexUserInputQuestionOptionSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
});
export type CodexUserInputQuestionOption = z.infer<typeof CodexUserInputQuestionOptionSchema>;

export const CodexUserInputQuestionSchema = z.object({
  id: z.string().min(1),
  header: z.string().min(1),
  question: z.string().min(1),
  options: z.array(CodexUserInputQuestionOptionSchema).min(1),
});
export type CodexUserInputQuestion = z.infer<typeof CodexUserInputQuestionSchema>;

export const CodexTurnDiffFileSchema = z.object({
  path: z.string().min(1),
  oldPath: z.string().min(1).nullable().optional(),
  status: z.string().min(1),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});
export type CodexTurnDiffFile = z.infer<typeof CodexTurnDiffFileSchema>;

export const CodexTurnDiffSchema = z.object({
  patch: z.string(),
  files: z.array(CodexTurnDiffFileSchema),
});
export type CodexTurnDiff = z.infer<typeof CodexTurnDiffSchema>;

export const CodexSessionEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('state'),
    sessionId: z.string().min(1),
    status: CodexSessionStatusSchema,
    threadId: z.string().min(1).nullable().optional(),
    turnId: z.string().min(1).nullable().optional(),
    message: z.string().min(1).nullable().optional(),
  }),
  z.object({
    type: z.literal('assistant-delta'),
    sessionId: z.string().min(1),
    itemId: z.string().min(1).nullable().optional(),
    text: z.string(),
  }),
  z.object({
    type: z.literal('activity'),
    sessionId: z.string().min(1),
    tone: z.enum(['info', 'tool', 'error']),
    phase: CodexActivityPhaseSchema,
    label: z.string().min(1),
    detail: z.string().nullable().optional(),
    itemId: z.string().min(1).nullable().optional(),
    itemType: z.string().min(1).nullable().optional(),
  }),
  z.object({
    type: z.literal('approval-requested'),
    sessionId: z.string().min(1),
    requestId: z.string().min(1),
    kind: CodexApprovalKindSchema,
    title: z.string().min(1),
    detail: z.string().nullable().optional(),
    command: z.string().nullable().optional(),
    cwd: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal('approval-resolved'),
    sessionId: z.string().min(1),
    requestId: z.string().min(1),
    decision: CodexApprovalDecisionSchema,
  }),
  z.object({
    type: z.literal('user-input-requested'),
    sessionId: z.string().min(1),
    requestId: z.string().min(1),
    questions: z.array(CodexUserInputQuestionSchema).min(1),
  }),
  z.object({
    type: z.literal('user-input-resolved'),
    sessionId: z.string().min(1),
    requestId: z.string().min(1),
  }),
  z.object({
    type: z.literal('turn-completed'),
    sessionId: z.string().min(1),
    turnId: z.string().min(1).nullable().optional(),
    status: z.enum(['completed', 'failed', 'interrupted', 'cancelled']),
    error: z.string().nullable().optional(),
    completedAt: z.string().min(1).nullable().optional(),
    diff: CodexTurnDiffSchema.nullable().optional(),
  }),
]);
export type CodexSessionEvent = z.infer<typeof CodexSessionEventSchema>;

export const TerminalSessionStatusSchema = z.enum([
  'starting',
  'running',
  'exited',
  'error',
]);
export type TerminalSessionStatus = z.infer<typeof TerminalSessionStatusSchema>;

export const OpenTerminalSessionInputSchema = z.object({
  sessionId: z.string().min(1),
  cwd: z.string().min(1),
  cols: z.number().int().min(20).max(400).optional(),
  rows: z.number().int().min(5).max(200).optional(),
});
export type OpenTerminalSessionInput = z.infer<typeof OpenTerminalSessionInputSchema>;

export const WriteTerminalSessionInputSchema = z.object({
  sessionId: z.string().min(1),
  data: z.string().min(1).max(65_536),
});
export type WriteTerminalSessionInput = z.infer<typeof WriteTerminalSessionInputSchema>;

export const ResizeTerminalSessionInputSchema = z.object({
  sessionId: z.string().min(1),
  cols: z.number().int().min(20).max(400),
  rows: z.number().int().min(5).max(200),
});
export type ResizeTerminalSessionInput = z.infer<typeof ResizeTerminalSessionInputSchema>;

export const TerminalSessionSnapshotSchema = z.object({
  sessionId: z.string().min(1),
  cwd: z.string().min(1),
  status: TerminalSessionStatusSchema,
  pid: z.number().int().positive().nullable(),
  history: z.string(),
  exitCode: z.number().int().nullable(),
  exitSignal: z.number().int().nullable(),
  error: z.string().min(1).nullable(),
  updatedAt: z.string().min(1),
});
export type TerminalSessionSnapshot = z.infer<typeof TerminalSessionSnapshotSchema>;

export const TerminalSessionEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('started'),
    sessionId: z.string().min(1),
    snapshot: TerminalSessionSnapshotSchema,
  }),
  z.object({
    type: z.literal('output'),
    sessionId: z.string().min(1),
    data: z.string(),
  }),
  z.object({
    type: z.literal('exited'),
    sessionId: z.string().min(1),
    exitCode: z.number().int().nullable(),
    exitSignal: z.number().int().nullable(),
  }),
  z.object({
    type: z.literal('error'),
    sessionId: z.string().min(1),
    message: z.string().min(1),
  }),
]);
export type TerminalSessionEvent = z.infer<typeof TerminalSessionEventSchema>;

export const BrowserViewBoundsSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
});
export type BrowserViewBounds = z.infer<typeof BrowserViewBoundsSchema>;

export const BrowserViewSnapshotSchema = z.object({
  targetId: z.string().min(1),
  currentUrl: z.string().min(1),
  pageTitle: z.string(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  isLoading: z.boolean(),
  isVisible: z.boolean(),
  lastLoadError: z.string().nullable(),
});
export type BrowserViewSnapshot = z.infer<typeof BrowserViewSnapshotSchema>;

export const BrowserViewEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('snapshot'),
    snapshot: BrowserViewSnapshotSchema,
  }),
]);
export type BrowserViewEvent = z.infer<typeof BrowserViewEventSchema>;

export const PrCommitSchema = z.object({
  sha: z.string().min(1),
  shortSha: z.string().min(1),
  title: z.string(),
  body: z.string(),
  authorName: z.string(),
  authorDate: z.string(),
});
export type PrCommit = z.infer<typeof PrCommitSchema>;

export const CodeChangesMetaSchema = z.object({
  baseBranch: z.string().min(1),
  headBranch: z.string().min(1),
  commits: z.array(PrCommitSchema),
});
export type CodeChangesMeta = z.infer<typeof CodeChangesMetaSchema>;

export const GitBranchHistorySchema = z.object({
  branch: z.string().min(1),
  commits: z.array(PrCommitSchema),
});
export type GitBranchHistory = z.infer<typeof GitBranchHistorySchema>;

export const PrDiffMetaSchema = CodeChangesMetaSchema.extend({
  status: z.literal('ready'),
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
  validateLocalGitRepository: (directoryPath: string) => Promise<void>;
  getGithubRepoDetails: (projectPath: string) => Promise<RepoDetails>;
  findLocalGithubRepoPath: (slug: string) => Promise<string | null>;
  onAppShortcutCommand: (listener: (command: AppShortcutCommand) => void) => () => void;
  cloneGithubRepo: (slug: string) => Promise<string>;
  onCloneProgress: (listener: (line: string) => void) => () => void;
  getGitBranches: (repoPath: string) => Promise<GitBranch[]>;
  getGitDefaultBranch: (repoPath: string) => Promise<string>;
  getGitBranchHistory: (
    repoPath: string,
    branchName: string,
  ) => Promise<GitBranchHistory>;
  startGitStateWatch: (repoPath: string) => Promise<string>;
  stopGitStateWatch: (subscriptionId: string) => Promise<void>;
  getGitBranchCompareMeta: (
    repoPath: string,
    baseBranch: string,
    headBranch: string,
  ) => Promise<CodeChangesMeta>;
  getGitBranchCompareDiff: (
    repoPath: string,
    baseBranch: string,
    headBranch: string,
  ) => Promise<string>;
  getGitStatus: (repoPath: string) => Promise<GitStatus>;
  getGitWorkingTreeDiff: (repoPath: string) => Promise<string>;
  checkoutGitBranch: (repoPath: string, branchName: string) => Promise<void>;
  getGitFileDiff: (repoPath: string, filePath: string) => Promise<string>;
  createGitWorktree: (repoPath: string, baseBranch: string) => Promise<CreateGitWorktreeResult>;
  promoteGitWorktreeBranch: (
    repoPath: string,
    currentBranch: string,
    prompt: string,
  ) => Promise<PromoteGitWorktreeBranchResult>;
  commitWorkingTreeSelection: (
    input: CommitWorkingTreeSelectionInput,
  ) => Promise<CommitWorkingTreeSelectionResult>;
  generatePrReview: (repoPath: string, prNumber: number, title: string) => Promise<PrReview>;
  getPrDiffMeta: (repoPath: string, prNumber: number) => Promise<PrDiffMetaResult>;
  syncRepoReviewRefs: (repoPath: string, owner: string, name: string) => Promise<void>;
  createGitHubPrReviewThread: (
    input: CreateGitHubPrReviewThreadInput,
  ) => Promise<CreateGitHubPrReviewThreadResult>;
  getCommitDiff: (repoPath: string, commitSha: string) => Promise<string>;
  getPrDiff: (repoPath: string, prNumber: number) => Promise<string>;
  getGitBlobText: (input: {
    repoPath: string;
    revision: string;
    filePath: string;
    maxBytes?: number;
  }) => Promise<string | null>;
  getWorkingTreeFileText: (input: {
    repoPath: string;
    filePath: string;
    maxBytes?: number;
  }) => Promise<string | null>;
  getCommitParent: (repoPath: string, commitSha: string) => Promise<string | null>;
  sendCodexSessionPrompt: (input: {
    sessionId: string;
    cwd: string;
    prompt: string;
    settings: CodexComposerSettings;
    attachments: CodexImageAttachmentInput[];
    resumeThreadId?: string | null;
    transcriptBootstrap?: string | null;
  }) => Promise<void>;
  listCodexThreads: (input: ListCodexThreadsInput) => Promise<CodexThreadSummary[]>;
  resumeCodexThread: (input: {
    sessionId: string;
    cwd: string;
    threadId: string;
    settings: CodexComposerSettings;
  }) => Promise<CodexResumedThread>;
  searchCodexPaths: (input: CodexPathSearchInput) => Promise<CodexPathSearchResult>;
  interruptCodexSession: (sessionId: string) => Promise<void>;
  stopCodexSession: (sessionId: string) => Promise<void>;
  respondToCodexApproval: (input: {
    sessionId: string;
    requestId: string;
    decision: CodexApprovalDecision;
  }) => Promise<void>;
  respondToCodexUserInput: (input: {
    sessionId: string;
    requestId: string;
    answers: Record<string, string>;
  }) => Promise<void>;
  openTerminalSession: (input: OpenTerminalSessionInput) => Promise<TerminalSessionSnapshot>;
  writeTerminalSession: (input: WriteTerminalSessionInput) => Promise<void>;
  resizeTerminalSession: (input: ResizeTerminalSessionInput) => Promise<void>;
  closeTerminalSession: (sessionId: string) => Promise<void>;
  showBrowserView: (input: {
    targetId: string;
    bounds: BrowserViewBounds;
  }) => Promise<BrowserViewSnapshot>;
  hideBrowserView: (targetId: string) => Promise<void>;
  updateBrowserViewBounds: (input: {
    targetId: string;
    bounds: BrowserViewBounds;
  }) => Promise<void>;
  navigateBrowserView: (input: {
    targetId: string;
    url: string;
  }) => Promise<BrowserViewSnapshot>;
  goBackBrowserView: (targetId: string) => Promise<BrowserViewSnapshot>;
  goForwardBrowserView: (targetId: string) => Promise<BrowserViewSnapshot>;
  reloadBrowserView: (targetId: string) => Promise<BrowserViewSnapshot>;
  openBrowserViewDevTools: (targetId: string) => Promise<void>;
  disposeBrowserView: (targetId: string) => Promise<void>;
  onGitStateChanged: (listener: (event: GitStateChangedEvent) => void) => () => void;
  onCodexSessionEvent: (listener: (event: CodexSessionEvent) => void) => () => void;
  onTerminalSessionEvent: (listener: (event: TerminalSessionEvent) => void) => () => void;
  onBrowserViewEvent: (listener: (event: BrowserViewEvent) => void) => () => void;
}
