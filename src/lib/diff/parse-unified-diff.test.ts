import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseUnifiedDiffDocument,
  projectDiffRows,
} from '@/lib/diff';

describe('parseUnifiedDiffDocument', () => {
  it('parses file metadata, hunks, and original diff line numbers', () => {
    const document = parseUnifiedDiffDocument(`diff --git a/src/example.ts b/src/example.ts
index 1111111..2222222 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,3 +1,3 @@
 const a = 1;
-const removed = true;
+const added = true;
 const z = 3;`);

    assert.equal(document.files.length, 1);

    const file = document.files[0]!;
    assert.equal(file.displayPath, 'src/example.ts');
    assert.equal(file.status, 'modified');
    assert.equal(file.hunks.length, 1);
    assert.equal(file.additions, 1);
    assert.equal(file.deletions, 1);

    const hunk = file.hunks[0]!;
    assert.equal(hunk.originalStartLineNumber, 1);
    assert.deepEqual(
      hunk.lines.map((line) => ({
        kind: line.kind,
        old: line.oldLineNumber,
        next: line.newLineNumber,
        original: line.originalDiffLineNumber,
      })),
      [
        { kind: 'context', old: 1, next: 1, original: 2 },
        { kind: 'delete', old: 2, next: null, original: 3 },
        { kind: 'add', old: null, next: 2, original: 4 },
        { kind: 'context', old: 3, next: 3, original: 5 },
      ],
    );
  });

  it('marks the previous line when the diff reports no trailing newline', () => {
    const document = parseUnifiedDiffDocument(`diff --git a/file.txt b/file.txt
index 1111111..2222222 100644
--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@
-old line
\\ No newline at end of file
+new line`);

    const file = document.files[0]!;
    const hunk = file.hunks[0]!;

    assert.equal(hunk.lines[0]?.noTrailingNewline, true);
    assert.equal(hunk.lines[1]?.noTrailingNewline, false);
  });

  it('parses renamed files and binary file markers', () => {
    const renamed = parseUnifiedDiffDocument(`diff --git a/old-name.ts b/new-name.ts
similarity index 92%
rename from old-name.ts
rename to new-name.ts`);
    const binary = parseUnifiedDiffDocument(`diff --git a/a.png b/a.png
new file mode 100644
index 0000000..1111111
Binary files /dev/null and b/a.png differ`);

    assert.equal(renamed.files[0]?.status, 'renamed');
    assert.equal(renamed.files[0]?.displayPath, 'new-name.ts');
    assert.equal(binary.files[0]?.kind, 'binary');
    assert.equal(binary.files[0]?.isBinary, true);
    assert.equal(binary.files[0]?.status, 'added');
  });

  it('normalizes working tree prefixes in diff paths', () => {
    const document = parseUnifiedDiffDocument(`diff --git w/src/example.ts w/src/example.ts
index 1111111..2222222 100644
--- w/src/example.ts
+++ w/src/example.ts
@@ -1 +1 @@
-before
+after`);

    const file = document.files[0]!;
    assert.equal(file.oldPath, 'src/example.ts');
    assert.equal(file.newPath, 'src/example.ts');
    assert.equal(file.displayPath, 'src/example.ts');
  });

  it('normalizes mnemonic prefixes in diff paths', () => {
    const document = parseUnifiedDiffDocument(`diff --git c/src/example.ts w/src/example.ts
index 1111111..2222222 100644
--- c/src/example.ts
+++ w/src/example.ts
@@ -1 +1 @@
-before
+after`);

    const file = document.files[0]!;
    assert.equal(file.oldPath, 'src/example.ts');
    assert.equal(file.newPath, 'src/example.ts');
    assert.equal(file.displayPath, 'src/example.ts');
  });
});

describe('projectDiffRows', () => {
  it('creates modified rows for paired add/delete lines and preserves context rows', () => {
    const document = parseUnifiedDiffDocument(`diff --git a/src/example.ts b/src/example.ts
index 1111111..2222222 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -10,4 +10,5 @@
 alpha
-before one
-before two
+after one
+after two
 omega`);

    const rows = projectDiffRows(document.files[0]!);

    assert.deepEqual(
      rows.map((row) => row.kind),
      ['hunk', 'context', 'modified', 'modified', 'context'],
    );
  });

  it('keeps unmatched add/delete lines as standalone rows after pairing what it can', () => {
    const document = parseUnifiedDiffDocument(`diff --git a/src/example.ts b/src/example.ts
index 1111111..2222222 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -10,2 +10,3 @@
-before one
+after one
+after two`);

    const rows = projectDiffRows(document.files[0]!);

    assert.deepEqual(
      rows.map((row) => row.kind),
      ['hunk', 'modified', 'added'],
    );
  });
});
