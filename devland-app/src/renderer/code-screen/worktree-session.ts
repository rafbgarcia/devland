import type { CodeTarget } from '@/ipc/contracts';
import type { CodexPromptSubmission } from '@/lib/codex-chat';

export const DETACHED_WORKTREE_TARGET_TITLE = '<branch name tbd>';

export function getSessionNamingPromptText(submission: CodexPromptSubmission): string {
  return submission.prompt.trim().length > 0
    ? submission.prompt
    : submission.attachments.map((attachment) => attachment.name).join(', ') || 'update';
}

export function getWorktreeTargetTitle(branchName: string): string {
  return branchName === 'HEAD' ? DETACHED_WORKTREE_TARGET_TITLE : branchName;
}

export function shouldBootstrapSessionNaming(
  sessionThreadId: string | null,
): boolean {
  return sessionThreadId === null;
}

export function shouldBootstrapDetachedWorktreeBranch(
  target: CodeTarget,
): boolean {
  return (
    target.kind === 'worktree' &&
    target.title === DETACHED_WORKTREE_TARGET_TITLE
  );
}
