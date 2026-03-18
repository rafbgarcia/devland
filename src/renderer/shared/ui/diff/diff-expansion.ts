import { getDiffRowsRenderLineCount, type DiffFile, type DiffRow } from '@/lib/diff';

import type { DiffFileContents } from './highlighter';

export const DEFAULT_DIFF_EXPANSION_STEP = 20;

export type DiffExpansionAction = 'up' | 'down' | 'all';
export type DiffExpansionPosition = 'top' | 'middle' | 'bottom';

export type DiffGapExpansionState = {
  revealedStartCount: number;
  revealedEndCount: number;
};

export type DiffFileExpansionState = Record<string, DiffGapExpansionState>;

export type DiffExpansionGap = {
  id: string;
  position: DiffExpansionPosition;
  startLineNumber: number;
  endLineNumber: number;
  totalLineCount: number;
  hiddenLineCount: number;
  revealedStartCount: number;
  revealedEndCount: number;
  insertBeforeRowIndex: number | null;
  canExpandUp: boolean;
  canExpandDown: boolean;
  topVisibleLineNumbers: readonly number[];
  bottomVisibleLineNumbers: readonly number[];
};

export type DiffRenderExpansionItem =
  | {
      kind: 'row';
      key: string;
      rowIndex: number | null;
      row: DiffRow;
      isExpandedContext: boolean;
    }
  | {
      kind: 'collapsed-hunk';
      key: string;
      gap: DiffExpansionGap;
      rowIndex: number;
      row: Extract<DiffRow, { kind: 'hunk' }>;
    }
  | {
      kind: 'expansion-control';
      key: string;
      gap: DiffExpansionGap;
    };

type DiffExpansionLineSource = {
  side: 'old' | 'new';
  lines: readonly string[];
};

function getLineSource(contents: DiffFileContents | null): DiffExpansionLineSource | null {
  if (contents === null) {
    return null;
  }

  if (contents.newContents.length > 0) {
    return {
      side: 'new',
      lines: contents.newContents,
    };
  }

  if (contents.oldContents.length > 0) {
    return {
      side: 'old',
      lines: contents.oldContents,
    };
  }

  return {
    side: 'new',
    lines: [],
  };
}

function getHunkStartLine(file: DiffFile, hunkIndex: number, side: 'old' | 'new') {
  const hunk = file.hunks[hunkIndex];
  if (!hunk) {
    return null;
  }

  return side === 'new' ? hunk.header.newStartLine : hunk.header.oldStartLine;
}

function getHunkLineCount(file: DiffFile, hunkIndex: number, side: 'old' | 'new') {
  const hunk = file.hunks[hunkIndex];
  if (!hunk) {
    return null;
  }

  return side === 'new' ? hunk.header.newLineCount : hunk.header.oldLineCount;
}

function normalizeGapState(totalLineCount: number, state: DiffGapExpansionState | undefined): DiffGapExpansionState {
  const revealedStartCount = Math.max(
    0,
    Math.min(totalLineCount, state?.revealedStartCount ?? 0),
  );
  const revealedEndCount = Math.max(
    0,
    Math.min(totalLineCount - revealedStartCount, state?.revealedEndCount ?? 0),
  );

  return { revealedStartCount, revealedEndCount };
}

function buildLineNumberRange(start: number, count: number) {
  return Array.from({ length: count }, (_, index) => start + index);
}

function createExpandedContextRow(
  lineNumber: number,
  content: string,
): Extract<DiffRow, { kind: 'context' }> {
  return {
    kind: 'context',
    content,
    beforeLineNumber: lineNumber,
    afterLineNumber: lineNumber,
    originalDiffLineNumber: -lineNumber,
  };
}

export function getDiffExpansionGaps(
  file: DiffFile,
  rows: readonly DiffRow[],
  contents: DiffFileContents | null,
  expansionState: DiffFileExpansionState = {},
) {
  const lineSource = getLineSource(contents);
  if (file.kind !== 'text' || file.hunks.length === 0 || lineSource === null) {
    return [] as DiffExpansionGap[];
  }

  const hunkRowIndexes = rows.reduce<number[]>((result, row, rowIndex) => {
    if (row.kind === 'hunk') {
      result.push(rowIndex);
    }

    return result;
  }, []);

  if (hunkRowIndexes.length !== file.hunks.length) {
    return [] as DiffExpansionGap[];
  }

  const gaps: DiffExpansionGap[] = [];
  const lastLineNumber = lineSource.lines.length;

  for (let hunkIndex = 0; hunkIndex < file.hunks.length; hunkIndex += 1) {
    const position = hunkIndex === 0 ? 'top' : 'middle';
    const insertBeforeRowIndex = hunkRowIndexes[hunkIndex] ?? null;
    const currentHunkStart = getHunkStartLine(file, hunkIndex, lineSource.side);
    const previousHunkStart = hunkIndex === 0
      ? null
      : getHunkStartLine(file, hunkIndex - 1, lineSource.side);
    const previousHunkCount = hunkIndex === 0
      ? null
      : getHunkLineCount(file, hunkIndex - 1, lineSource.side);

    if (currentHunkStart === null) {
      continue;
    }

    const startLineNumber = hunkIndex === 0
      ? 1
      : previousHunkStart === null || previousHunkCount === null
      ? null
      : previousHunkStart + previousHunkCount;
    const endLineNumber = currentHunkStart - 1;

    if (startLineNumber === null || startLineNumber > endLineNumber || startLineNumber > lastLineNumber) {
      continue;
    }

    const clampedEndLineNumber = Math.min(endLineNumber, lastLineNumber);
    const totalLineCount = clampedEndLineNumber - startLineNumber + 1;

    if (totalLineCount <= 0) {
      continue;
    }

    const id = position === 'top'
      ? `top:${file.hunks[hunkIndex]!.originalStartLineNumber}`
      : `middle:${file.hunks[hunkIndex - 1]!.originalStartLineNumber}:${file.hunks[hunkIndex]!.originalStartLineNumber}`;
    const normalizedState = normalizeGapState(totalLineCount, expansionState[id]);
    const hiddenLineCount =
      totalLineCount - normalizedState.revealedStartCount - normalizedState.revealedEndCount;

    gaps.push({
      id,
      position,
      startLineNumber,
      endLineNumber: clampedEndLineNumber,
      totalLineCount,
      hiddenLineCount,
      revealedStartCount: normalizedState.revealedStartCount,
      revealedEndCount: normalizedState.revealedEndCount,
      insertBeforeRowIndex,
      canExpandUp: hiddenLineCount > 0,
      canExpandDown: hiddenLineCount > 0 && position === 'middle',
      topVisibleLineNumbers: buildLineNumberRange(startLineNumber, normalizedState.revealedStartCount),
      bottomVisibleLineNumbers: buildLineNumberRange(
        clampedEndLineNumber - normalizedState.revealedEndCount + 1,
        normalizedState.revealedEndCount,
      ),
    });
  }

  const lastHunkIndex = file.hunks.length - 1;
  const lastHunkStart = getHunkStartLine(file, lastHunkIndex, lineSource.side);
  const lastHunkCount = getHunkLineCount(file, lastHunkIndex, lineSource.side);

  if (lastHunkStart !== null && lastHunkCount !== null) {
    const startLineNumber = lastHunkStart + lastHunkCount;
    const endLineNumber = lastLineNumber;

    if (startLineNumber <= endLineNumber) {
      const totalLineCount = endLineNumber - startLineNumber + 1;
      const id = `bottom:${file.hunks[lastHunkIndex]!.originalStartLineNumber}`;
      const normalizedState = normalizeGapState(totalLineCount, expansionState[id]);
      const hiddenLineCount =
        totalLineCount - normalizedState.revealedStartCount - normalizedState.revealedEndCount;

      gaps.push({
        id,
        position: 'bottom',
        startLineNumber,
        endLineNumber,
        totalLineCount,
        hiddenLineCount,
        revealedStartCount: normalizedState.revealedStartCount,
        revealedEndCount: normalizedState.revealedEndCount,
        insertBeforeRowIndex: null,
        canExpandUp: false,
        canExpandDown: hiddenLineCount > 0,
        topVisibleLineNumbers: buildLineNumberRange(startLineNumber, normalizedState.revealedStartCount),
        bottomVisibleLineNumbers: buildLineNumberRange(
          endLineNumber - normalizedState.revealedEndCount + 1,
          normalizedState.revealedEndCount,
        ),
      });
    }
  }

  return gaps;
}

export function buildDiffRenderExpansionItems(
  file: DiffFile,
  rows: readonly DiffRow[],
  contents: DiffFileContents | null,
  expansionState: DiffFileExpansionState = {},
) {
  const lineSource = getLineSource(contents);
  const gaps = getDiffExpansionGaps(file, rows, contents, expansionState);
  const gapsByRowIndex = new Map<number, DiffExpansionGap[]>();
  const trailingGaps: DiffExpansionGap[] = [];

  for (const gap of gaps) {
    if (gap.insertBeforeRowIndex === null) {
      trailingGaps.push(gap);
      continue;
    }

    const existing = gapsByRowIndex.get(gap.insertBeforeRowIndex);
    if (existing) {
      existing.push(gap);
    } else {
      gapsByRowIndex.set(gap.insertBeforeRowIndex, [gap]);
    }
  }

  const items: DiffRenderExpansionItems = [];

  const pushGapItems = (gap: DiffExpansionGap, mergeWithFollowingHunk = false) => {
    if (lineSource === null) {
      return;
    }

    for (const lineNumber of gap.topVisibleLineNumbers) {
      const content = lineSource.lines[lineNumber - 1] ?? '';
      items.push({
        kind: 'row',
        key: `${gap.id}:line:${lineNumber}`,
        rowIndex: null,
        row: createExpandedContextRow(lineNumber, content),
        isExpandedContext: true,
      });
    }

    if (gap.hiddenLineCount > 0 && !mergeWithFollowingHunk) {
      items.push({
        kind: 'expansion-control',
        key: `${gap.id}:control`,
        gap,
      });
    }

    for (const lineNumber of gap.bottomVisibleLineNumbers) {
      const content = lineSource.lines[lineNumber - 1] ?? '';
      items.push({
        kind: 'row',
        key: `${gap.id}:line:${lineNumber}`,
        rowIndex: null,
        row: createExpandedContextRow(lineNumber, content),
        isExpandedContext: true,
      });
    }
  };

  rows.forEach((row, rowIndex) => {
    const beforeItems = gapsByRowIndex.get(rowIndex);
    const mergedGap = row.kind === 'hunk'
      ? beforeItems?.find((gap) => gap.hiddenLineCount > 0) ?? null
      : null;
    if (beforeItems) {
      beforeItems.forEach((gap) => pushGapItems(gap, gap === mergedGap));
    }

    if (row.kind === 'hunk' && mergedGap !== null) {
      items.push({
        kind: 'collapsed-hunk',
        key: `${mergedGap.id}:hunk`,
        gap: mergedGap,
        rowIndex,
        row,
      });
      return;
    }

    const shouldRenderRow =
      row.kind !== 'hunk' ||
      beforeItems === undefined ||
      beforeItems.every((gap) => gap.hiddenLineCount > 0);

    if (!shouldRenderRow) {
      return;
    }

    items.push({
      kind: 'row',
      key: row.kind === 'hunk'
        ? `hunk:${row.originalStartLineNumber}`
        : row.kind === 'context'
        ? `context:${row.originalDiffLineNumber}`
        : row.kind === 'modified'
        ? `modified:${row.before.originalDiffLineNumber}:${row.after.originalDiffLineNumber}`
        : `${row.kind}:${row.data.originalDiffLineNumber}`,
      rowIndex,
      row,
      isExpandedContext: false,
    });
  });

  trailingGaps.forEach((gap) => pushGapItems(gap));

  return items;
}

type DiffRenderExpansionItems = DiffRenderExpansionItem[];

export function getExpandedDiffRenderLineCount({
  file,
  rows,
  contents,
  expansionState = {},
}: {
  file: DiffFile;
  rows: readonly DiffRow[];
  contents: DiffFileContents | null;
  expansionState?: DiffFileExpansionState | undefined;
}) {
  const baseCount = getDiffRowsRenderLineCount(rows);
  const gaps = getDiffExpansionGaps(file, rows, contents, expansionState);
  const hiddenHunkHeaderCount = gaps.filter(
    (gap) => gap.insertBeforeRowIndex !== null && gap.hiddenLineCount === 0,
  ).length;

  return gaps.reduce((count, gap) => {
    const visibleLineCount = gap.revealedStartCount + gap.revealedEndCount;
    const controlLineCount = gap.hiddenLineCount > 0 && gap.insertBeforeRowIndex === null ? 1 : 0;

    return count + visibleLineCount + controlLineCount;
  }, baseCount - hiddenHunkHeaderCount);
}

export function expandDiffGap(
  currentState: DiffFileExpansionState,
  gap: Pick<DiffExpansionGap, 'id' | 'position' | 'totalLineCount'>,
  action: DiffExpansionAction,
  step = DEFAULT_DIFF_EXPANSION_STEP,
) {
  const existing = normalizeGapState(gap.totalLineCount, currentState[gap.id]);

  if (action === 'up' && gap.position === 'bottom') {
    return currentState;
  }

  if (action === 'down' && gap.position === 'top') {
    return currentState;
  }

  let nextState: DiffGapExpansionState;

  if (action === 'all') {
    nextState = {
      revealedStartCount: gap.totalLineCount,
      revealedEndCount: 0,
    };
  } else if (action === 'down') {
    nextState = normalizeGapState(gap.totalLineCount, {
      revealedStartCount: existing.revealedStartCount + step,
      revealedEndCount: existing.revealedEndCount,
    });
  } else {
    nextState = normalizeGapState(gap.totalLineCount, {
      revealedStartCount: existing.revealedStartCount,
      revealedEndCount: existing.revealedEndCount + step,
    });
  }

  if (
    nextState.revealedStartCount === existing.revealedStartCount &&
    nextState.revealedEndCount === existing.revealedEndCount
  ) {
    return currentState;
  }

  return {
    ...currentState,
    [gap.id]: nextState,
  };
}
