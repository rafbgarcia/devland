import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GitStatusFile } from '@/ipc/contracts';
import {
  DEFAULT_CODEX_CHANGE_ORDER_STATE,
  reconcileCodexChangeOrderState,
  recordCodexTouchedFile,
  sortWorkingTreeFiles,
  toggleCodexChangeSortMode,
} from '@/renderer/code-screen/codex-change-order';

function modifiedFile(path: string, oldPath?: string): GitStatusFile {
  return {
    path,
    oldPath: oldPath ?? null,
    status: 'modified',
    hasStagedChanges: false,
    hasUnstagedChanges: true,
  };
}

describe('recordCodexTouchedFile', () => {
  it('records first-touch order once per file', () => {
    const withFileTwo = recordCodexTouchedFile(DEFAULT_CODEX_CHANGE_ORDER_STATE, 'file2.ts');
    const withBothFiles = recordCodexTouchedFile(withFileTwo, 'file1.ts');
    const withDuplicateTouch = recordCodexTouchedFile(withBothFiles, 'file2.ts');

    assert.deepEqual(withDuplicateTouch.touchSequenceByPath, {
      'file2.ts': 1,
      'file1.ts': 2,
    });
    assert.equal(withDuplicateTouch.nextSequence, 3);
  });
});

describe('reconcileCodexChangeOrderState', () => {
  it('removes tracked files after they return clean', () => {
    const trackedState = recordCodexTouchedFile(
      recordCodexTouchedFile(DEFAULT_CODEX_CHANGE_ORDER_STATE, 'file2.ts'),
      'file1.ts',
    );

    const reconciledState = reconcileCodexChangeOrderState(trackedState, [modifiedFile('file1.ts')]);

    assert.deepEqual(reconciledState.touchSequenceByPath, {
      'file1.ts': 2,
    });
  });

  it('moves tracked rename history to the current path', () => {
    const trackedState = recordCodexTouchedFile(DEFAULT_CODEX_CHANGE_ORDER_STATE, 'before.ts');

    const reconciledState = reconcileCodexChangeOrderState(trackedState, [
      {
        path: 'after.ts',
        oldPath: 'before.ts',
        status: 'renamed',
        hasStagedChanges: false,
        hasUnstagedChanges: true,
      },
    ]);

    assert.deepEqual(reconciledState.touchSequenceByPath, {
      'after.ts': 1,
    });
  });
});

describe('sortWorkingTreeFiles', () => {
  it('keeps files in first-touch order for Codex-tracked changes', () => {
    const trackedState = recordCodexTouchedFile(
      recordCodexTouchedFile(DEFAULT_CODEX_CHANGE_ORDER_STATE, 'file2.ts'),
      'file1.ts',
    );

    const sortedPaths = sortWorkingTreeFiles(
      [modifiedFile('file1.ts'), modifiedFile('file2.ts')],
      trackedState.sortMode,
      trackedState.touchSequenceByPath,
    ).map((file) => file.path);

    assert.deepEqual(sortedPaths, ['file2.ts', 'file1.ts']);
  });

  it('falls back to alphabetical order for untracked working tree files', () => {
    const trackedState = recordCodexTouchedFile(DEFAULT_CODEX_CHANGE_ORDER_STATE, 'file2.ts');

    const sortedPaths = sortWorkingTreeFiles(
      [modifiedFile('zeta.ts'), modifiedFile('alpha.ts'), modifiedFile('file2.ts')],
      trackedState.sortMode,
      trackedState.touchSequenceByPath,
    ).map((file) => file.path);

    assert.deepEqual(sortedPaths, ['file2.ts', 'alpha.ts', 'zeta.ts']);
  });

  it('supports switching back to alphabetical order', () => {
    const trackedState = recordCodexTouchedFile(
      recordCodexTouchedFile(DEFAULT_CODEX_CHANGE_ORDER_STATE, 'file2.ts'),
      'file1.ts',
    );

    const sortedPaths = sortWorkingTreeFiles(
      [modifiedFile('file1.ts'), modifiedFile('file2.ts')],
      toggleCodexChangeSortMode(trackedState.sortMode),
      trackedState.touchSequenceByPath,
    ).map((file) => file.path);

    assert.deepEqual(sortedPaths, ['file1.ts', 'file2.ts']);
  });

  it('gives files a new position after they return clean and are touched again', () => {
    const firstPass = recordCodexTouchedFile(
      recordCodexTouchedFile(DEFAULT_CODEX_CHANGE_ORDER_STATE, 'file2.ts'),
      'file1.ts',
    );
    const cleanedState = reconcileCodexChangeOrderState(firstPass, [modifiedFile('file1.ts')]);
    const touchedAgainState = recordCodexTouchedFile(cleanedState, 'file2.ts');

    const sortedPaths = sortWorkingTreeFiles(
      [modifiedFile('file1.ts'), modifiedFile('file2.ts')],
      touchedAgainState.sortMode,
      touchedAgainState.touchSequenceByPath,
    ).map((file) => file.path);

    assert.deepEqual(sortedPaths, ['file1.ts', 'file2.ts']);
    assert.deepEqual(touchedAgainState.touchSequenceByPath, {
      'file1.ts': 2,
      'file2.ts': 3,
    });
  });
});
