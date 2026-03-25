import { z } from 'zod';
import { type DevlandRunCommandResult } from '@devlandapp/sdk';

import type {
  CodexComposerSettings,
  CodexChatImageAttachment,
  CodexImageAttachmentInput,
  CodexPromptAttachment,
} from '@/lib/codex-chat';
import {
  ProjectExtensionSchema,
  type ExtensionVersion,
  type ProjectExtension,
  type InstallRepoExtensionInput,
  type InstallRepoExtensionVersionInput,
  type RepoConfig,
  type RunExtensionCommandInput,
} from '@/extensions/contracts';

export const GET_APP_BOOTSTRAP_CHANNEL = 'app:get-app-bootstrap';
export const PICK_REPO_DIRECTORY_CHANNEL = 'app:pick-repo-directory';
export const CLOSE_CURRENT_WINDOW_CHANNEL = 'app:close-current-window';
export const VALIDATE_LOCAL_GIT_REPO_CHANNEL = 'app:validate-local-git-repo';
export const GET_GITHUB_REPO_DETAILS_CHANNEL = 'app:get-github-repo-details';
export const GET_REMOTE_REPO_README_CHANNEL = 'app:get-remote-repo-readme';
export const GET_GITHUB_REPO_OVERVIEW_CHANNEL = 'app:get-github-repo-overview';
export const GET_REPO_CONFIG_CHANNEL = 'app:get-repo-config';
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
export const GET_GIT_BRANCH_PROMPT_REQUESTS_CHANNEL = 'app:get-git-branch-prompt-requests';
export const GET_GIT_STATUS_CHANNEL = 'app:get-git-status';
export const GET_GIT_WORKING_TREE_DIFF_CHANNEL = 'app:get-git-working-tree-diff';
export const CHECKOUT_GIT_BRANCH_CHANNEL = 'app:checkout-git-branch';
export const GET_GIT_FILE_DIFF_CHANNEL = 'app:get-git-file-diff';
export const CREATE_GIT_WORKTREE_CHANNEL = 'app:create-git-worktree';
export const SUGGEST_GIT_WORKTREE_BRANCH_NAME_CHANNEL = 'app:suggest-git-worktree-branch-name';
export const CREATE_GIT_BRANCH_CHANNEL = 'app:create-git-branch';
export const CHECK_GIT_WORKTREE_REMOVAL_CHANNEL = 'app:check-git-worktree-removal';
export const REMOVE_GIT_WORKTREE_CHANNEL = 'app:remove-git-worktree';
export const COMMIT_WORKING_TREE_SELECTION_CHANNEL = 'app:commit-working-tree-selection';
export const GET_CODEX_PROMPT_REQUEST_CHECKPOINT_CHANNEL = 'app:get-codex-prompt-request-checkpoint';
export const WRITE_GIT_PROMPT_REQUEST_NOTE_CHANNEL = 'app:write-git-prompt-request-note';
export const SEND_CODEX_SESSION_PROMPT_CHANNEL = 'app:send-codex-session-prompt';
export const PERSIST_CODEX_ATTACHMENTS_CHANNEL = 'app:persist-codex-attachments';
export const LIST_CODEX_THREADS_CHANNEL = 'app:list-codex-threads';
export const RESUME_CODEX_THREAD_CHANNEL = 'app:resume-codex-thread';
export const SEARCH_CODEX_PATHS_CHANNEL = 'app:search-codex-paths';
export const INTERRUPT_CODEX_SESSION_CHANNEL = 'app:interrupt-codex-session';
export const STOP_CODEX_SESSION_CHANNEL = 'app:stop-codex-session';
export const RESPOND_TO_CODEX_APPROVAL_CHANNEL = 'app:respond-to-codex-approval';
export const RESPOND_TO_CODEX_USER_INPUT_CHANNEL = 'app:respond-to-codex-user-input';
export const CODEX_SESSION_EVENT_CHANNEL = 'app:codex-session-event';
export const OPEN_TERMINAL_SESSION_CHANNEL = 'app:open-terminal-session';
export const EXEC_TERMINAL_SESSION_COMMAND_CHANNEL = 'app:exec-terminal-session-command';
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
export const DISPOSE_BROWSER_TARGET_CHANNEL = 'app:dispose-browser-target';
export const BROWSER_VIEW_EVENT_CHANNEL = 'app:browser-view-event';
export const GET_COMMIT_DIFF_CHANNEL = 'app:get-commit-diff';
export const GET_GIT_BLOB_TEXT_CHANNEL = 'app:get-git-blob-text';
export const GET_WORKING_TREE_FILE_TEXT_CHANNEL = 'app:get-working-tree-file-text';
export const GET_COMMIT_PARENT_CHANNEL = 'app:get-commit-parent';
export const GET_GIT_PROMPT_REQUEST_ASSET_DATA_URL_CHANNEL = 'app:get-git-prompt-request-asset-data-url';
export const GET_REPO_EXTENSIONS_CHANNEL = 'app:get-repo-extensions';
export const INSTALL_REPO_EXTENSION_CHANNEL = 'app:install-repo-extension';
export const INSTALL_REPO_EXTENSION_VERSION_CHANNEL = 'app:install-repo-extension-version';
export const LIST_EXTENSION_VERSIONS_CHANNEL = 'app:list-extension-versions';
export const RUN_EXTENSION_COMMAND_CHANNEL = 'app:run-extension-command';
export const LIST_AVAILABLE_EXTERNAL_EDITORS_CHANNEL = 'app:list-available-external-editors';
export const PICK_EXTERNAL_EDITOR_PATH_CHANNEL = 'app:pick-external-editor-path';
export const VALIDATE_EXTERNAL_EDITOR_PATH_CHANNEL = 'app:validate-external-editor-path';
export const OPEN_FILE_IN_EXTERNAL_EDITOR_CHANNEL = 'app:open-file-in-external-editor';

export const PROJECT_VIEW_TABS = [
  'code',
  'prompt-requests',
] as const;

export const ProjectViewTabSchema = z.enum(PROJECT_VIEW_TABS);
export type ProjectViewTab = (typeof PROJECT_VIEW_TABS)[number];

export const DEFAULT_PROJECT_VIEW_TAB: ProjectViewTab = 'code';

export const CODE_WORKSPACE_PANES = [
  'changes',
  'codex',
  'browser',
  'terminal',
] as const;
export const CodeWorkspacePaneSchema = z.enum(CODE_WORKSPACE_PANES);
export type CodeWorkspacePane = z.infer<typeof CodeWorkspacePaneSchema>;

export const DEFAULT_CODE_WORKSPACE_PANE: CodeWorkspacePane = 'codex';

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
  z.object({
    type: z.literal('cycle-code-target-tab'),
    direction: AppShortcutDirectionSchema,
  }),
  z.object({
    type: z.literal('cycle-code-pane'),
    direction: AppShortcutDirectionSchema,
  }),
  z.object({
    type: z.literal('create-code-session'),
  }),
  z.object({
    type: z.literal('close-current-tab'),
  }),
  z.object({
    type: z.literal('toggle-shortcut-hints'),
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

export const CodexResumedThreadImageAttachmentSchema = z.object({
  type: z.literal('image'),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  previewUrl: z.string().min(1).nullable(),
});
export type CodexResumedThreadImageAttachment = z.infer<typeof CodexResumedThreadImageAttachmentSchema>;

export const CodexDraftAttachmentSchema = z.object({
  type: z.literal('image'),
  id: z.string().min(1),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  previewUrl: z.string().min(1),
});
export type CodexDraftAttachment = z.infer<typeof CodexDraftAttachmentSchema>;
export const CodexResumedThreadMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  attachments: z.array(CodexResumedThreadImageAttachmentSchema),
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

export const RepoWorkspaceStateSchema = z.object({
  activeTabId: z.string().min(1),
  activeCodeTargetId: z.string().min(1).nullable(),
  activeCodePaneId: CodeWorkspacePaneSchema,
});
export type RepoWorkspaceState = z.infer<typeof RepoWorkspaceStateSchema>;

export const WorkspaceSessionSchema = z.object({
  activeRepoId: z.string().min(1).nullable(),
  repoViewById: z.record(z.string().min(1), RepoWorkspaceStateSchema),
});
export type WorkspaceSession = z.infer<typeof WorkspaceSessionSchema>;

export const EXTERNAL_EDITOR_TARGET_PATH_ARGUMENT = '%TARGET_PATH%';

export const AvailableExternalEditorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});
export type AvailableExternalEditor = z.infer<typeof AvailableExternalEditorSchema>;

export const CustomExternalEditorSchema = z.object({
  path: z.string().min(1),
  arguments: z.string(),
  bundleId: z.string().min(1).optional(),
});
export type CustomExternalEditor = z.infer<typeof CustomExternalEditorSchema>;

export const ExternalEditorPreferenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('detected'),
    editorId: z.string().min(1),
    editorName: z.string().min(1),
  }),
  z.object({
    kind: z.literal('custom'),
    path: z.string().min(1),
    arguments: z.string(),
    bundleId: z.string().min(1).optional(),
  }),
]);
export type ExternalEditorPreference = z.infer<typeof ExternalEditorPreferenceSchema>;

export const PickedExternalEditorPathSchema = z.object({
  path: z.string().min(1),
  bundleId: z.string().min(1).optional(),
});
export type PickedExternalEditorPath = z.infer<typeof PickedExternalEditorPathSchema>;

export const ValidateExternalEditorPathResultSchema = z.object({
  isValid: z.boolean(),
  bundleId: z.string().min(1).optional(),
});
export type ValidateExternalEditorPathResult = z.infer<
  typeof ValidateExternalEditorPathResultSchema
>;

export const OpenFileInExternalEditorInputSchema = z.object({
  repoPath: z.string().min(1),
  relativeFilePath: z.string().min(1),
  preference: ExternalEditorPreferenceSchema,
});
export type OpenFileInExternalEditorInput = z.infer<
  typeof OpenFileInExternalEditorInputSchema
>;

export const AppBootstrapSchema = z.object({
  ghCliAvailable: z.boolean(),
});
export type AppBootstrap = z.infer<typeof AppBootstrapSchema>;

export const RepoDetailsSchema = z.object({
  projectPath: z.string().min(1),
  githubSlug: z.string().min(1),
  owner: z.string().min(1),
  name: z.string().min(1),
});
export type RepoDetails = z.infer<typeof RepoDetailsSchema>;

export const GithubRepoOverviewSchema = z.object({
  description: z.string().nullable(),
  stars: z.number(),
  forks: z.number(),
  language: z.string().nullable(),
  topics: z.array(z.string()),
  updatedAt: z.string(),
  license: z.string().nullable(),
  openIssues: z.number(),
});
export type GithubRepoOverview = z.infer<typeof GithubRepoOverviewSchema>;

export const RemoteRepoReadmeSchema = z.object({
  path: z.string().min(1),
  markdown: z.string(),
  htmlUrl: z.string().url().nullable(),
});
export type RemoteRepoReadme = z.infer<typeof RemoteRepoReadmeSchema>;

export const ProjectExtensionsSchema = z.array(ProjectExtensionSchema);
export const InstallRepoExtensionResultSchema = z.void();

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
  initialTitle: z.string().min(1),
  worktreeSetupCommand: z.string().min(1).optional(),
});
export type CreateGitWorktreeResult = z.infer<typeof CreateGitWorktreeResultSchema>;

export const SuggestGitWorktreeBranchNameResultSchema = z.object({
  branch: z.string().min(1),
});
export type SuggestGitWorktreeBranchNameResult = z.infer<typeof SuggestGitWorktreeBranchNameResultSchema>;

export const RemoveGitWorktreeReasonSchema = z.enum([
  'dirty',
  'unreferenced-detached-head',
]);
export type RemoveGitWorktreeReason = z.infer<typeof RemoveGitWorktreeReasonSchema>;

export const CheckGitWorktreeRemovalResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('safe'),
  }),
  z.object({
    status: z.literal('confirmation-required'),
    reasons: z.array(RemoveGitWorktreeReasonSchema).min(1),
  }),
]);
export type CheckGitWorktreeRemovalResult = z.infer<typeof CheckGitWorktreeRemovalResultSchema>;

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

export const CodexTokenUsageBreakdownSchema = z.object({
  cachedInputTokens: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningOutputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});
export type CodexTokenUsageBreakdown = z.infer<typeof CodexTokenUsageBreakdownSchema>;

export const CodexThreadTokenUsageSchema = z.object({
  last: CodexTokenUsageBreakdownSchema,
  total: CodexTokenUsageBreakdownSchema,
  modelContextWindow: z.number().int().positive().nullable(),
});
export type CodexThreadTokenUsage = z.infer<typeof CodexThreadTokenUsageSchema>;

export const CODEX_PLAN_STEP_STATUSES = ['pending', 'inProgress', 'completed'] as const;
export const CodexPlanStepStatusSchema = z.enum(CODEX_PLAN_STEP_STATUSES);
export type CodexPlanStepStatus = z.infer<typeof CodexPlanStepStatusSchema>;

export const CodexPlanStepSchema = z.object({
  step: z.string().min(1),
  status: CodexPlanStepStatusSchema,
});
export type CodexPlanStep = z.infer<typeof CodexPlanStepSchema>;

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
    type: z.literal('thread-token-usage-updated'),
    sessionId: z.string().min(1),
    threadId: z.string().min(1).nullable().optional(),
    turnId: z.string().min(1).nullable().optional(),
    tokenUsage: CodexThreadTokenUsageSchema,
  }),
  z.object({
    type: z.literal('turn-plan-updated'),
    sessionId: z.string().min(1),
    turnId: z.string().min(1).nullable().optional(),
    explanation: z.string().min(1).nullable().optional(),
    plan: z.array(CodexPlanStepSchema),
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
    filePath: z.string().min(1).nullable().optional(),
    filePaths: z.array(z.string().min(1)).optional(),
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

export const ExecTerminalSessionCommandInputSchema = z.object({
  sessionId: z.string().min(1),
  cwd: z.string().min(1),
  command: z.string().min(1),
  cols: z.number().int().min(20).max(400).optional(),
  rows: z.number().int().min(5).max(200).optional(),
});
export type ExecTerminalSessionCommandInput = z.infer<typeof ExecTerminalSessionCommandInputSchema>;

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
  browserViewId: z.string().min(1),
  codeTargetId: z.string().min(1),
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

export const CodexPromptRequestActivitySchema = z.object({
  id: z.string().min(1),
  tone: z.enum(['info', 'tool', 'error']),
  phase: z.enum(['started', 'updated', 'completed', 'instant']),
  label: z.string().min(1),
  detail: z.string().nullable(),
  itemId: z.string().min(1).nullable(),
  itemType: z.string().min(1).nullable(),
  filePath: z.string().min(1).nullable().optional(),
  filePaths: z.array(z.string().min(1)).optional(),
});
export type CodexPromptRequestActivity = z.infer<typeof CodexPromptRequestActivitySchema>;

export const CodexPromptRequestImageAssetSchema = z.object({
  ref: z.string().min(1),
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
});
export type CodexPromptRequestImageAsset = z.infer<typeof CodexPromptRequestImageAssetSchema>;

export const CodexPromptRequestImageAttachmentSchema = z.object({
  type: z.literal('image'),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  previewUrl: z.string().min(1).nullable(),
  asset: CodexPromptRequestImageAssetSchema.nullable().optional(),
});
export type CodexPromptRequestImageAttachment = z.infer<
  typeof CodexPromptRequestImageAttachmentSchema
>;

export const CodexPromptRequestMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  attachments: z.array(CodexPromptRequestImageAttachmentSchema),
  createdAt: z.string().min(1),
  completedAt: z.string().min(1).nullable(),
  turnId: z.string().min(1).nullable(),
  itemId: z.string().min(1).nullable(),
});
export type CodexPromptRequestMessage = z.infer<typeof CodexPromptRequestMessageSchema>;

export const CodexPromptRequestTranscriptEntrySchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string().min(1),
    kind: z.literal('message'),
    message: CodexPromptRequestMessageSchema,
  }),
  z.object({
    id: z.string().min(1),
    kind: z.literal('work'),
    activities: z.array(CodexPromptRequestActivitySchema),
  }),
]);
export type CodexPromptRequestTranscriptEntry = z.infer<
  typeof CodexPromptRequestTranscriptEntrySchema
>;

export const CodexPromptRequestCheckpointSchema = z.object({
  transcriptEntryStart: z.number().int().nonnegative(),
  transcriptEntryEnd: z.number().int().nonnegative(),
});
export type CodexPromptRequestCheckpoint = z.infer<typeof CodexPromptRequestCheckpointSchema>;

export const CodexPromptRequestThreadSettingsSchema = z.object({
  model: z.string().min(1),
  reasoningEffort: z.string().min(1),
});
export type CodexPromptRequestThreadSettings = z.infer<
  typeof CodexPromptRequestThreadSettingsSchema
>;

export const GitPromptRequestSnapshotSchema = z.object({
  version: z.literal(2),
  threadId: z.string().min(1),
  branchName: z.string().min(1),
  createdAt: z.string().min(1),
  settings: CodexPromptRequestThreadSettingsSchema,
  checkpoint: CodexPromptRequestCheckpointSchema,
  transcriptEntries: z.array(CodexPromptRequestTranscriptEntrySchema),
});
export type GitPromptRequestSnapshot = z.infer<typeof GitPromptRequestSnapshotSchema>;

export const GitPromptRequestCommitSchema = PrCommitSchema.extend({
  snapshot: GitPromptRequestSnapshotSchema.nullable(),
});
export type GitPromptRequestCommit = z.infer<typeof GitPromptRequestCommitSchema>;

export const GitBranchPromptRequestsSchema = z.object({
  baseBranch: z.string().min(1),
  headBranch: z.string().min(1),
  commits: z.array(GitPromptRequestCommitSchema),
});
export type GitBranchPromptRequests = z.infer<typeof GitBranchPromptRequestsSchema>;

export interface ElectronApi {
  readonly platform: NodeJS.Platform;
  readonly versions: {
    readonly chrome: string;
    readonly electron: string;
    readonly node: string;
  };
  getAppBootstrap: () => Promise<AppBootstrap>;
  pickRepoDirectory: () => Promise<string | null>;
  closeCurrentWindow: () => Promise<void>;
  validateLocalGitRepository: (directoryPath: string) => Promise<void>;
  getGithubRepoDetails: (projectPath: string) => Promise<RepoDetails>;
  getRemoteRepoReadme: (slug: string) => Promise<RemoteRepoReadme | null>;
  getGithubRepoOverview: (slug: string) => Promise<GithubRepoOverview | null>;
  getRepoConfig: (repoPath: string) => Promise<RepoConfig>;
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
  getGitBranchPromptRequests: (input: {
    repoPath: string;
    baseBranch: string;
    headBranch: string;
  }) => Promise<GitBranchPromptRequests>;
  getGitStatus: (repoPath: string) => Promise<GitStatus>;
  getGitWorkingTreeDiff: (repoPath: string) => Promise<string>;
  checkoutGitBranch: (repoPath: string, branchName: string) => Promise<void>;
  getGitFileDiff: (repoPath: string, filePath: string) => Promise<string>;
  createGitWorktree: (repoPath: string) => Promise<CreateGitWorktreeResult>;
  suggestGitWorktreeBranchName: (
    repoPath: string,
    prompt: string,
  ) => Promise<SuggestGitWorktreeBranchNameResult>;
  createGitBranch: (repoPath: string, branchName: string) => Promise<void>;
  checkGitWorktreeRemoval: (
    repoPath: string,
    worktreePath: string,
  ) => Promise<CheckGitWorktreeRemovalResult>;
  removeGitWorktree: (
    repoPath: string,
    worktreePath: string,
    force?: boolean,
  ) => Promise<void>;
  commitWorkingTreeSelection: (
    input: CommitWorkingTreeSelectionInput,
  ) => Promise<CommitWorkingTreeSelectionResult>;
  getCodexPromptRequestCheckpoint: (input: {
    repoPath: string;
    threadId: string;
  }) => Promise<number>;
  writeGitPromptRequestNote: (input: {
    repoPath: string;
    commitSha: string;
    threadId: string;
    transcriptEntryCount: number;
    snapshot: GitPromptRequestSnapshot;
  }) => Promise<void>;
  getCommitDiff: (repoPath: string, commitSha: string) => Promise<string>;
  getGitPromptRequestAssetDataUrl: (input: {
    repoPath: string;
    ref: string;
    assetPath: string;
    mimeType: string;
  }) => Promise<string>;
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
  getRepoExtensions: (repoPath: string) => Promise<ProjectExtension[]>;
  installRepoExtension: (input: InstallRepoExtensionInput) => Promise<void>;
  installRepoExtensionVersion: (input: InstallRepoExtensionVersionInput) => Promise<void>;
  listExtensionVersions: (repoPath: string, extensionId: string) => Promise<ExtensionVersion[]>;
  runExtensionCommand: (
    input: RunExtensionCommandInput,
  ) => Promise<DevlandRunCommandResult>;
  listAvailableExternalEditors: () => Promise<AvailableExternalEditor[]>;
  pickExternalEditorPath: () => Promise<PickedExternalEditorPath | null>;
  validateExternalEditorPath: (
    editorPath: string,
  ) => Promise<ValidateExternalEditorPathResult>;
  openFileInExternalEditor: (input: OpenFileInExternalEditorInput) => Promise<void>;
  persistCodexAttachments: (input: {
    sessionId: string;
    attachments: CodexImageAttachmentInput[];
  }) => Promise<CodexChatImageAttachment[]>;
  sendCodexSessionPrompt: (input: {
    sessionId: string;
    cwd: string;
    prompt: string;
    settings: CodexComposerSettings;
    attachments: CodexPromptAttachment[];
    persistedAttachments?: CodexChatImageAttachment[];
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
  execTerminalSessionCommand: (input: ExecTerminalSessionCommandInput) => Promise<void>;
  writeTerminalSession: (input: WriteTerminalSessionInput) => Promise<void>;
  resizeTerminalSession: (input: ResizeTerminalSessionInput) => Promise<void>;
  closeTerminalSession: (sessionId: string) => Promise<void>;
  showBrowserView: (input: {
    browserViewId: string;
    codeTargetId: string;
    bounds: BrowserViewBounds;
  }) => Promise<BrowserViewSnapshot>;
  hideBrowserView: (browserViewId: string) => Promise<void>;
  updateBrowserViewBounds: (input: {
    browserViewId: string;
    bounds: BrowserViewBounds;
  }) => Promise<void>;
  navigateBrowserView: (input: {
    browserViewId: string;
    codeTargetId: string;
    url: string;
  }) => Promise<BrowserViewSnapshot>;
  goBackBrowserView: (browserViewId: string) => Promise<BrowserViewSnapshot>;
  goForwardBrowserView: (browserViewId: string) => Promise<BrowserViewSnapshot>;
  reloadBrowserView: (browserViewId: string) => Promise<BrowserViewSnapshot>;
  openBrowserViewDevTools: (browserViewId: string) => Promise<void>;
  disposeBrowserView: (browserViewId: string) => Promise<void>;
  disposeBrowserTarget: (codeTargetId: string) => Promise<void>;
  onGitStateChanged: (listener: (event: GitStateChangedEvent) => void) => () => void;
  onCodexSessionEvent: (listener: (event: CodexSessionEvent) => void) => () => void;
  onTerminalSessionEvent: (listener: (event: TerminalSessionEvent) => void) => () => void;
  onBrowserViewEvent: (listener: (event: BrowserViewEvent) => void) => () => void;
}
