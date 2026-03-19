import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DiffSelection,
  formatPatchFromSelection,
  getSelectableDiffLineNumbers,
  parseUnifiedDiffDocument,
} from '@/lib/diff';

describe('DiffSelection', () => {
  it('tracks line selection against the default all-selected state', () => {
    const selection = DiffSelection.all(new Set([3, 4, 8]));
    const partialSelection = selection.withLineSelection(4, false);

    assert.equal(selection.getSelectionType(), 'all');
    assert.equal(partialSelection.getSelectionType(), 'partial');
    assert.equal(partialSelection.isSelected(3), true);
    assert.equal(partialSelection.isSelected(4), false);
    assert.equal(partialSelection.isSelected(8), true);
  });

  it('switches to none when every selectable line diverges from the default', () => {
    const selection = DiffSelection.all(new Set([10, 11])).withRangeSelection([10, 11], false);

    assert.equal(selection.getSelectionType(), 'none');
    assert.deepEqual(selection.getSelectedLineNumbers(), []);
  });
});

describe('formatPatchFromSelection', () => {
  it('formats a partial patch for a modified file while preserving original headers', () => {
    const document = parseUnifiedDiffDocument(`diff --git a/src/example.ts b/src/example.ts
index 1111111..2222222 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,4 +1,4 @@
 const a = 1;
-const before = true;
+const after = true;
-const removeMe = false;
+const keepMe = false;`);
    const file = document.files[0]!;
    const selectableLines = getSelectableDiffLineNumbers(file);
    const selection = DiffSelection.all(selectableLines)
      .withLineSelection(5, false)
      .withLineSelection(6, false);
    const patch = formatPatchFromSelection(file, selection);

    assert.equal(
      patch,
      `diff --git a/src/example.ts b/src/example.ts
index 1111111..2222222 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,3 +1,3 @@
 const a = 1;
-const before = true;
+const after = true;
 const removeMe = false;
`,
    );
  });

  it('drops unselected additions for new files', () => {
    const document = parseUnifiedDiffDocument(`diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,2 @@
+first line
+second line`);
    const file = document.files[0]!;
    const selection = DiffSelection.all(getSelectableDiffLineNumbers(file)).withLineSelection(3, false);
    const patch = formatPatchFromSelection(file, selection);

    assert.equal(
      patch,
      `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1 @@
+first line
`,
    );
  });
});
