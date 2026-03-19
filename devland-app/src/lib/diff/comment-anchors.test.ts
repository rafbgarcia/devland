import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildDiffCommentAnchor, parseUnifiedDiffDocument, projectDiffRows } from '@/lib/diff';

describe('buildDiffCommentAnchor', () => {
  it('builds a multi-line anchor on the new side from modified rows', () => {
    const file = parseUnifiedDiffDocument(`diff --git a/example.ts b/example.ts
index 1111111..2222222 100644
--- a/example.ts
+++ b/example.ts
@@ -1,3 +1,3 @@
-const a = 1;
-const b = 2;
+const a = 10;
+const b = 20;
 const c = 3;`).files[0]!;
    const rows = projectDiffRows(file).filter((row) => row.kind === 'modified');
    const anchor = buildDiffCommentAnchor(file, rows, 'new');

    assert.deepEqual(anchor, {
      path: 'example.ts',
      oldPath: 'example.ts',
      newPath: 'example.ts',
      side: 'new',
      line: 2,
      startLine: 1,
      endLine: 2,
      excerpt: ['const a = 10;', 'const b = 20;'],
    });
  });
});
