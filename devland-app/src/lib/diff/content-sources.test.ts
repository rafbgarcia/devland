import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createCommitContentPair,
  createComparisonContentPair,
  createWorkingTreeContentPair,
  getDiffLineFilters,
  parseUnifiedDiffDocument,
} from '@/lib/diff';

describe('getDiffLineFilters', () => {
  it('prefers old-side tokens for mixed diffs and new-side tokens for add-only diffs', () => {
    const mixedDocument = parseUnifiedDiffDocument(`diff --git a/file.ts b/file.ts
index 1111111..2222222 100644
--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,2 @@
-before
+after
 same`);
    const addOnlyDocument = parseUnifiedDiffDocument(`diff --git a/file.ts b/file.ts
new file mode 100644
--- /dev/null
+++ b/file.ts
@@ -0,0 +1,2 @@
+one
+two`);

    assert.deepEqual(getDiffLineFilters(mixedDocument.files[0]!.hunks), {
      oldLineFilter: [0, 1],
      newLineFilter: [0],
    });
    assert.deepEqual(getDiffLineFilters(addOnlyDocument.files[0]!.hunks), {
      oldLineFilter: [],
      newLineFilter: [0, 1],
    });
  });
});

describe('content pair builders', () => {
  it('builds working tree sources from file status and paths', () => {
    const file = parseUnifiedDiffDocument(`diff --git a/src/file.ts b/src/file.ts
index 1111111..2222222 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -1 +1 @@
-old
+new`).files[0]!;

    assert.deepEqual(createWorkingTreeContentPair('/repo', file), {
      displayPath: 'src/file.ts',
      oldSource: {
        type: 'git',
        repoPath: '/repo',
        revision: 'HEAD',
        path: 'src/file.ts',
      },
      newSource: {
        type: 'working-tree',
        repoPath: '/repo',
        path: 'src/file.ts',
      },
    });
  });

  it('builds commit and comparison sources with deleted and added edge cases', () => {
    const addedFile = parseUnifiedDiffDocument(`diff --git a/src/file.ts b/src/file.ts
new file mode 100644
--- /dev/null
+++ b/src/file.ts
@@ -0,0 +1 @@
+new`).files[0]!;
    const deletedFile = parseUnifiedDiffDocument(`diff --git a/src/file.ts b/src/file.ts
deleted file mode 100644
--- a/src/file.ts
+++ /dev/null
@@ -1 +0,0 @@
-old`).files[0]!;

    assert.equal(createCommitContentPair('/repo', 'abc123', null, addedFile).oldSource.type, 'none');
    assert.equal(
      createComparisonContentPair('/repo', 'base123', 'head123', deletedFile).newSource.type,
      'none',
    );
  });
});
