import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  areComposerTagTriggersEqual,
  detectComposerTagTrigger,
  replaceTextRange,
} from '@/renderer/code-screen/chat-composer-tags';

describe('detectComposerTagTrigger', () => {
  it('detects current-repo tag tokens', () => {
    assert.deepEqual(detectComposerTagTrigger('Inspect @src/main.ts please', 20), {
      scope: 'current',
      query: 'src/main.ts',
      rangeStart: 8,
      rangeEnd: 20,
    });
  });

  it('detects cross-project tag tokens', () => {
    assert.deepEqual(detectComposerTagTrigger('Inspect @/owner/repo/src/main.ts', 32), {
      scope: 'global',
      query: 'owner/repo/src/main.ts',
      rangeStart: 8,
      rangeEnd: 32,
    });
  });

  it('returns null when the cursor is not in a tag token', () => {
    assert.equal(detectComposerTagTrigger('Inspect src/main.ts', 19), null);
  });
});

describe('areComposerTagTriggersEqual', () => {
  it('treats identical triggers as equal', () => {
    assert.equal(
      areComposerTagTriggersEqual(
        {
          scope: 'global',
          query: 'owner/repo/src/main.ts',
          rangeStart: 8,
          rangeEnd: 32,
        },
        {
          scope: 'global',
          query: 'owner/repo/src/main.ts',
          rangeStart: 8,
          rangeEnd: 32,
        },
      ),
      true,
    );
  });

  it('treats different cursor ranges as different triggers', () => {
    assert.equal(
      areComposerTagTriggersEqual(
        {
          scope: 'current',
          query: 'src/main.ts',
          rangeStart: 8,
          rangeEnd: 20,
        },
        {
          scope: 'current',
          query: 'src/main.ts',
          rangeStart: 8,
          rangeEnd: 21,
        },
      ),
      false,
    );
  });
});

describe('replaceTextRange', () => {
  it('replaces a token range and returns the next cursor position', () => {
    const replacement = '@/Users/rafa/github.com/acme/app/src/main.ts ';

    assert.deepEqual(replaceTextRange('Use @src/ma now', 4, 11, replacement), {
      value: `Use ${replacement} now`,
      cursor: 4 + replacement.length,
    });
  });
});
