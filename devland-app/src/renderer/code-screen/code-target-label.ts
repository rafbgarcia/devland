import type { CodeTarget } from '@/ipc/contracts';

const SESSION_TARGET_TITLE_PATTERN = /^Session\s+(\d+)$/;

export function formatCodeTargetLabel(input: {
  target: CodeTarget;
  rootBranch: string;
  threadName: string | null;
}): string {
  const { target, rootBranch, threadName } = input;

  if (threadName) {
    return threadName;
  }

  if (target.kind === 'root') {
    return rootBranch;
  }

  if (target.kind === 'session') {
    const match = SESSION_TARGET_TITLE_PATTERN.exec(target.title);

    if (match !== null) {
      return `${rootBranch}.${Number(match[1]) + 1}`;
    }
  }

  return target.title;
}
