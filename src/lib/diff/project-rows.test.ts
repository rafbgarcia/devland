import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getDiffRowsRenderLineCount, parseUnifiedDiffDocument, projectDiffRows } from '@/lib/diff';

describe('getDiffRowsRenderLineCount', () => {
  it('counts modified rows as two visual lines in unified mode', () => {
    const diff = [
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

    const file = parseUnifiedDiffDocument(diff).files[0]!;
    const rows = projectDiffRows(file);

    assert.equal(getDiffRowsRenderLineCount(rows, 'split'), rows.length);
    assert.equal(getDiffRowsRenderLineCount(rows, 'unified'), rows.length + 1);
  });
});
