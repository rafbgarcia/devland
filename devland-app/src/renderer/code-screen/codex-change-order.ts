import type { GitStatusFile } from '@/ipc/contracts';

export const CODEX_CHANGE_SORT_MODES = [
  'codex-first-touch',
  'alphabetical',
] as const;

export type CodexChangeSortMode = (typeof CODEX_CHANGE_SORT_MODES)[number];

export type CodexChangeOrderState = {
  sortMode: CodexChangeSortMode;
  touchSequenceByPath: Record<string, number>;
  nextSequence: number;
};

export const DEFAULT_CODEX_CHANGE_ORDER_STATE: CodexChangeOrderState = {
  sortMode: 'codex-first-touch',
  touchSequenceByPath: {},
  nextSequence: 1,
};

function getTrackedSequence(
  touchSequenceByPath: Readonly<Record<string, number>>,
  file: Pick<GitStatusFile, 'path' | 'oldPath'>,
): number | null {
  const directSequence = touchSequenceByPath[file.path];

  if (directSequence !== undefined) {
    return directSequence;
  }

  if (!file.oldPath) {
    return null;
  }

  return touchSequenceByPath[file.oldPath] ?? null;
}

export function toggleCodexChangeSortMode(
  sortMode: CodexChangeSortMode,
): CodexChangeSortMode {
  return sortMode === 'codex-first-touch' ? 'alphabetical' : 'codex-first-touch';
}

export function recordCodexTouchedFile(
  state: CodexChangeOrderState,
  filePath: string,
): CodexChangeOrderState {
  const normalizedPath = filePath.trim();

  if (normalizedPath.length === 0 || state.touchSequenceByPath[normalizedPath] !== undefined) {
    return state;
  }

  return {
    ...state,
    touchSequenceByPath: {
      ...state.touchSequenceByPath,
      [normalizedPath]: state.nextSequence,
    },
    nextSequence: state.nextSequence + 1,
  };
}

export function reconcileCodexChangeOrderState(
  state: CodexChangeOrderState,
  files: readonly GitStatusFile[],
): CodexChangeOrderState {
  const nextTouchSequenceByPath: Record<string, number> = {};

  for (const file of files) {
    const sequence = getTrackedSequence(state.touchSequenceByPath, file);

    if (sequence === null) {
      continue;
    }

    const existingSequence = nextTouchSequenceByPath[file.path];
    if (existingSequence === undefined || sequence < existingSequence) {
      nextTouchSequenceByPath[file.path] = sequence;
    }
  }

  const currentEntries = Object.entries(state.touchSequenceByPath);
  const nextEntries = Object.entries(nextTouchSequenceByPath);

  if (
    currentEntries.length === nextEntries.length &&
    currentEntries.every(([path, sequence]) => nextTouchSequenceByPath[path] === sequence)
  ) {
    return state;
  }

  return {
    ...state,
    touchSequenceByPath: nextTouchSequenceByPath,
  };
}

export function sortWorkingTreeFiles(
  files: readonly GitStatusFile[],
  sortMode: CodexChangeSortMode,
  touchSequenceByPath: Readonly<Record<string, number>>,
): GitStatusFile[] {
  const sortedFiles = [...files];

  sortedFiles.sort((left, right) => {
    if (sortMode === 'codex-first-touch') {
      const leftSequence = getTrackedSequence(touchSequenceByPath, left);
      const rightSequence = getTrackedSequence(touchSequenceByPath, right);

      if (leftSequence !== null && rightSequence !== null && leftSequence !== rightSequence) {
        return leftSequence - rightSequence;
      }

      if (leftSequence !== null) {
        return -1;
      }

      if (rightSequence !== null) {
        return 1;
      }
    }

    return left.path.localeCompare(right.path);
  });

  return sortedFiles;
}
