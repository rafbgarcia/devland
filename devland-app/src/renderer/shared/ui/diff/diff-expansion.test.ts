import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildDiffCommentAnchor, parseUnifiedDiffDocument, projectDiffRows } from '@/lib/diff';

import {
  buildDiffRenderExpansionItems,
  expandDiffGap,
  getDiffExpansionGaps,
} from './diff-expansion';
import type { DiffFileContents } from './highlighter';

function createContents(lines: string[]): DiffFileContents {
  return {
    pair: {
      displayPath: 'example.ts',
      oldSource: { type: 'working-tree', repoPath: '/tmp/repo', path: 'example.ts' },
      newSource: { type: 'working-tree', repoPath: '/tmp/repo', path: 'example.ts' },
    },
    oldContents: lines,
    newContents: lines,
  };
}

describe('diff-expansion', () => {
  it('builds top, middle, and bottom gaps from file contents', () => {
    const diff = [
      'diff --git a/example.ts b/example.ts',
      'index 1111111..2222222 100644',
      '--- a/example.ts',
      '+++ b/example.ts',
      '@@ -3,1 +3,1 @@',
      '-three',
      '+THREE',
      '@@ -7,1 +7,1 @@',
      '-seven',
      '+SEVEN',
      '',
    ].join('\n');
    const file = parseUnifiedDiffDocument(diff).files[0]!;
    const rows = projectDiffRows(file);
    const gaps = getDiffExpansionGaps(file, rows, createContents([
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
    ]));

    assert.deepEqual(
      gaps.map((gap) => ({
        id: gap.id,
        position: gap.position,
        start: gap.startLineNumber,
        end: gap.endLineNumber,
      })),
      [
        { id: 'top:1', position: 'top', start: 1, end: 2 },
        { id: 'middle:1:4', position: 'middle', start: 4, end: 6 },
        { id: 'bottom:4', position: 'bottom', start: 8, end: 9 },
      ],
    );
  });

  it('expands middle gaps from both sides and keeps row ordering stable', () => {
    const diff = [
      'diff --git a/example.ts b/example.ts',
      'index 1111111..2222222 100644',
      '--- a/example.ts',
      '+++ b/example.ts',
      '@@ -3,1 +3,1 @@',
      '-three',
      '+THREE',
      '@@ -7,1 +7,1 @@',
      '-seven',
      '+SEVEN',
      '',
    ].join('\n');
    const file = parseUnifiedDiffDocument(diff).files[0]!;
    const rows = projectDiffRows(file);
    const contents = createContents([
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
    ]);
    const middleGap = getDiffExpansionGaps(file, rows, contents).find((gap) => gap.position === 'middle')!;
    const expandedDown = expandDiffGap({}, middleGap, 'down', 2);
    const expandedBoth = expandDiffGap(expandedDown, middleGap, 'up', 1);
    const items = buildDiffRenderExpansionItems(file, rows, contents, expandedBoth);

    assert.deepEqual(
      items.map((item) =>
        item.kind === 'expansion-control'
          ? { kind: item.kind, hidden: item.gap.hiddenLineCount }
          : item.kind === 'collapsed-hunk'
          ? { kind: item.kind, hidden: item.gap.hiddenLineCount, row: item.row.kind }
          : item.isExpandedContext
          ? {
              kind: 'expanded-context',
              line: item.row.kind === 'context' ? item.row.afterLineNumber : null,
              content: item.row.kind === 'context' ? item.row.content : null,
            }
          : { kind: 'row', row: item.row.kind },
      ),
      [
        { kind: 'collapsed-hunk', hidden: 2, row: 'hunk' },
        { kind: 'row', row: 'deleted' },
        { kind: 'row', row: 'added' },
        { kind: 'expanded-context', line: 4, content: 'four' },
        { kind: 'expanded-context', line: 5, content: 'five' },
        { kind: 'expanded-context', line: 6, content: 'six' },
        { kind: 'row', row: 'deleted' },
        { kind: 'row', row: 'added' },
        { kind: 'expansion-control', hidden: 2 },
      ],
    );
  });

  it('hides a middle hunk header after the preceding gap is fully expanded', () => {
    const diff = [
      'diff --git a/example.ts b/example.ts',
      'index 1111111..2222222 100644',
      '--- a/example.ts',
      '+++ b/example.ts',
      '@@ -3,1 +3,1 @@',
      '-three',
      '+THREE',
      '@@ -7,1 +7,1 @@',
      '-seven',
      '+SEVEN',
      '',
    ].join('\n');
    const file = parseUnifiedDiffDocument(diff).files[0]!;
    const rows = projectDiffRows(file);
    const contents = createContents([
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
      'eight',
      'nine',
    ]);
    const middleGap = getDiffExpansionGaps(file, rows, contents).find((gap) => gap.position === 'middle')!;
    const expanded = expandDiffGap({}, middleGap, 'all');
    const items = buildDiffRenderExpansionItems(file, rows, contents, expanded);

    assert.deepEqual(
      items
        .flatMap((item) =>
          (item.kind === 'row' || item.kind === 'collapsed-hunk') && item.row.kind === 'hunk'
            ? [item.row.content]
            : []),
      ['@@ -3,1 +3,1 @@'],
    );
  });

  it('hides the first hunk header after the top gap is fully expanded', () => {
    const diff = [
      'diff --git a/example.ts b/example.ts',
      'index 1111111..2222222 100644',
      '--- a/example.ts',
      '+++ b/example.ts',
      '@@ -3,1 +3,1 @@',
      '-three',
      '+THREE',
      '',
    ].join('\n');
    const file = parseUnifiedDiffDocument(diff).files[0]!;
    const rows = projectDiffRows(file);
    const contents = createContents(['one', 'two', 'three', 'four']);
    const topGap = getDiffExpansionGaps(file, rows, contents).find((gap) => gap.position === 'top')!;
    const expanded = expandDiffGap({}, topGap, 'all');
    const items = buildDiffRenderExpansionItems(file, rows, contents, expanded);

    assert.equal(
      items.some((item) => item.kind === 'row' && item.row.kind === 'hunk'),
      false,
    );
  });

  it('treats expanded context rows as commentable context lines', () => {
    const diff = [
      'diff --git a/example.ts b/example.ts',
      'index 1111111..2222222 100644',
      '--- a/example.ts',
      '+++ b/example.ts',
      '@@ -3,1 +3,1 @@',
      '-three',
      '+THREE',
      '',
    ].join('\n');
    const file = parseUnifiedDiffDocument(diff).files[0]!;
    const rows = projectDiffRows(file);
    const contents = createContents(['one', 'two', 'three', 'four']);
    const gap = getDiffExpansionGaps(file, rows, contents)[0]!;
    const expanded = expandDiffGap({}, gap, 'all');
    const expandedRows = buildDiffRenderExpansionItems(file, rows, contents, expanded)
      .flatMap((item) => item.kind === 'row' && item.isExpandedContext ? [item.row] : []);
    const anchor = buildDiffCommentAnchor(file, expandedRows, 'new');

    assert.deepEqual(anchor, {
      path: 'example.ts',
      oldPath: 'example.ts',
      newPath: 'example.ts',
      side: 'new',
      line: 2,
      startLine: 1,
      endLine: 2,
      excerpt: ['one', 'two'],
    });
  });
});
