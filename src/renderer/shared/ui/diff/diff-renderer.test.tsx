import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { parseUnifiedDiffDocument, projectDiffRows } from '@/lib/diff';

import { DiffFileSection } from './diff-renderer';
import type { DiffRenderFile } from './use-diff-render-files';

function createRenderFile(): DiffRenderFile {
  const diffText = [
    'diff --git a/example.ts b/example.ts',
    'index 1111111..2222222 100644',
    '--- a/example.ts',
    '+++ b/example.ts',
    '@@ -1,2 +1,2 @@',
    '-const value = 1;',
    '+const value = 2;',
    ' const keep = true;',
    '',
  ].join('\n');
  const diff = parseUnifiedDiffDocument(diffText).files[0]!;

  return {
    path: diff.displayPath,
    status: diff.status,
    additions: diff.additions,
    deletions: diff.deletions,
    diff,
    rows: projectDiffRows(diff),
    contentPair: {
      displayPath: diff.displayPath,
      oldSource: { type: 'working-tree', repoPath: '/tmp/repo', path: diff.displayPath },
      newSource: { type: 'working-tree', repoPath: '/tmp/repo', path: diff.displayPath },
    },
    contents: null,
    syntaxTokens: null,
  };
}

describe('DiffFileSection', () => {
  it('overlays the change-group handle instead of reserving row width', () => {
    const markup = renderToStaticMarkup(
      <DiffFileSection
        file={createRenderFile()}
        sectionRef={() => {}}
        getHunkSelectionType={() => 'none'}
        hideHeader
      />,
    );

    assert.match(markup, /aria-label="Toggle change group selection"/);
    assert.match(markup, /absolute left-1 top-0 z-10 w-1\.5 rounded-full/);
    assert.doesNotMatch(markup, /\bpl-3\b/);
    assert.doesNotMatch(markup, /\bw-3\b/);
  });
});
