import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getDiffChangeGroups, parseUnifiedDiffDocument } from '@/lib/diff';

describe('getDiffChangeGroups', () => {
  it('splits contiguous changed lines into independent change groups', () => {
    const diff = parseUnifiedDiffDocument(`diff --git a/example.ts b/example.ts
index 1111111..2222222 100644
--- a/example.ts
+++ b/example.ts
@@ -1,6 +1,6 @@
 keep one
-before one
+after one
 keep two
-before two
-before three
+after two
+after three`).files[0]!;

    assert.deepEqual(getDiffChangeGroups(diff), [
      { startLineNumber: 3, selectableLineNumbers: [3, 4] },
      { startLineNumber: 6, selectableLineNumbers: [6, 7, 8, 9] },
    ]);
  });
});
