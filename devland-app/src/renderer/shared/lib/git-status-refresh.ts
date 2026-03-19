import type { CodexSessionEvent } from '@/ipc/contracts';
import { isToolLifecycleItemType } from '@/lib/codex-session-items';

export type GitStatusRefreshReason =
  | 'window-focus'
  | 'codex-tool-completed'
  | 'codex-turn-completed'
  | 'git-operation';

export type GitStatusRefreshRequest = {
  repoPath: string;
  reason: GitStatusRefreshReason;
};

type GitStatusRefreshListener = (request: GitStatusRefreshRequest) => void;

const listeners = new Set<GitStatusRefreshListener>();

export function subscribeToGitStatusRefresh(
  listener: GitStatusRefreshListener,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function requestGitStatusRefresh(request: GitStatusRefreshRequest): void {
  for (const listener of listeners) {
    listener(request);
  }
}

export function getGitStatusRefreshRequestForCodexEvent(
  event: CodexSessionEvent,
  repoPath: string,
): GitStatusRefreshRequest | null {
  if (event.type === 'turn-completed') {
    return {
      repoPath,
      reason: 'codex-turn-completed',
    };
  }

  if (event.type !== 'activity') {
    return null;
  }

  if (
    (event.phase !== 'completed' && event.phase !== 'instant') ||
    !isToolLifecycleItemType(event.itemType) ||
    event.itemType === 'web_search' ||
    event.itemType === 'image_view'
  ) {
    return null;
  }

  return {
    repoPath,
    reason: 'codex-tool-completed',
  };
}
