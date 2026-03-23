import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isComposerDraftDirty,
  sanitizeStoredComposerDrafts,
} from '@/renderer/code-screen/use-composer-drafts';

describe('sanitizeStoredComposerDrafts', () => {
  it('keeps valid drafts and discards empty or invalid entries', () => {
    const drafts = sanitizeStoredComposerDrafts({
      'repo-1:root': {
        prompt: 'Investigate tab persistence',
        attachments: [
          {
            id: 'attachment-1',
            type: 'image',
            name: 'composer.png',
            mimeType: 'image/png',
            sizeBytes: 1234,
            previewUrl: 'devland-codex-attachment://asset/ab/composer.png',
          },
        ],
        updatedAt: '2026-03-23T00:00:00.000Z',
      },
      'repo-1:session-2': {
        prompt: '   ',
        attachments: [],
        updatedAt: '2026-03-23T00:00:00.000Z',
      },
      invalid: {
        prompt: 'has bad attachment',
        attachments: [
          {
            id: '',
            type: 'image',
            name: 'broken.png',
            mimeType: 'image/png',
            sizeBytes: 10,
            previewUrl: '',
          },
        ],
        updatedAt: '2026-03-23T00:00:00.000Z',
      },
    });

    assert.deepEqual(Object.keys(drafts), ['repo-1:root', 'invalid']);
    assert.equal(drafts['repo-1:root']?.attachments[0]?.previewUrl, 'devland-codex-attachment://asset/ab/composer.png');
    assert.deepEqual(drafts.invalid?.attachments, []);
  });
});

describe('isComposerDraftDirty', () => {
  it('detects meaningful text or attachments', () => {
    assert.equal(isComposerDraftDirty({ prompt: '', attachments: [] }), false);
    assert.equal(isComposerDraftDirty({ prompt: '   ', attachments: [] }), false);
    assert.equal(isComposerDraftDirty({
      prompt: '',
      attachments: [
        {
          id: 'attachment-1',
          type: 'image',
          name: 'composer.png',
          mimeType: 'image/png',
          sizeBytes: 1234,
          previewUrl: 'devland-codex-attachment://asset/ab/composer.png',
        },
      ],
    }), true);
    assert.equal(isComposerDraftDirty({ prompt: 'needs follow-up', attachments: [] }), true);
  });
});
