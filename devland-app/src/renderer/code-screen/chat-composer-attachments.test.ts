import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createComposerImageAttachment } from '@/renderer/code-screen/chat-composer-attachments';

describe('createComposerImageAttachment', () => {
  it('builds a stable data url preview for image files', async () => {
    const file = new File(['preview'], 'preview.png', { type: 'image/png' });

    const attachment = await createComposerImageAttachment(file);

    assert.equal(attachment.name, 'preview.png');
    assert.equal(attachment.mimeType, 'image/png');
    assert.equal(attachment.sizeBytes, file.size);
    assert.match(attachment.dataUrl, /^data:image\/png;base64,/);
  });
});
