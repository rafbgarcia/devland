import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  appendPromptBlock,
  formatAnchoredDiffCommentPrompt,
} from '@/renderer/code-screen/chat-composer-prompt';

describe('chat-composer-prompt', () => {
  it('formats anchored diff comments for the composer', () => {
    assert.equal(
      formatAnchoredDiffCommentPrompt({
        filepath: 'devland-app/docs/ideas.md',
        lineStart: 3,
        lineEnd: 3,
        comment: 'testing comments on changed files.',
      }),
      '**devland-app/docs/ideas.md:3-3**\ntesting comments on changed files.',
    );
  });

  it('appends a block into an empty prompt', () => {
    assert.equal(
      appendPromptBlock('', '**file.ts:10-12**\nReview this block.'),
      '**file.ts:10-12**\nReview this block.',
    );
  });

  it('separates appended blocks from an existing prompt', () => {
    assert.equal(
      appendPromptBlock('Existing draft', '**file.ts:10-12**\nReview this block.'),
      'Existing draft\n\n**file.ts:10-12**\nReview this block.',
    );
  });
});
