import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getHighlightContentLines } from '@/renderer/shared/ui/diff/highlight-content';

describe('getHighlightContentLines', () => {
  it('skips syntax highlighting when the full file contents are unavailable', () => {
    assert.deepEqual(getHighlightContentLines([], [240]), []);
  });

  it('uses the loaded full file contents when requested lines are present', () => {
    const contentLines = ['first', 'second'];

    assert.deepEqual(getHighlightContentLines(contentLines, [1]), contentLines);
  });
});
