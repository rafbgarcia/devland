import type { CodeTarget } from '@/ipc/contracts';
import type { CodexPromptSubmission } from '@/lib/codex-chat';

export const DETACHED_WORKTREE_TARGET_TITLE = '<branch name tbd>';

export function getWorktreePromptText(submission: CodexPromptSubmission): string {
  return submission.prompt.trim().length > 0
    ? submission.prompt
    : submission.attachments.map((attachment) => attachment.name).join(', ') || 'update';
}

export function getWorktreeTargetTitle(branchName: string): string {
  return branchName === 'HEAD' ? DETACHED_WORKTREE_TARGET_TITLE : branchName;
}

export function shouldBootstrapDetachedWorktreeBranch(
  target: CodeTarget,
  sessionMessageCount: number,
): boolean {
  return (
    target.kind === 'worktree' &&
    target.title === DETACHED_WORKTREE_TARGET_TITLE &&
    sessionMessageCount === 0
  );
}

export async function sendPromptWithDetachedWorktreeBootstrap({
  target,
  sessionMessageCount,
  submission,
  bootstrapDetachedWorktreeBranch,
  sendPrompt,
}: {
  target: CodeTarget;
  sessionMessageCount: number;
  submission: CodexPromptSubmission;
  bootstrapDetachedWorktreeBranch: (submission: CodexPromptSubmission) => Promise<void>;
  sendPrompt: () => Promise<void>;
}) {
  if (shouldBootstrapDetachedWorktreeBranch(target, sessionMessageCount)) {
    await bootstrapDetachedWorktreeBranch(submission);
  }

  await sendPrompt();
}
