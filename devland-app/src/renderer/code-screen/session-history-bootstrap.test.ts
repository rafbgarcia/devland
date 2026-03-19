import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildSessionHistoryBootstrap } from '@/renderer/code-screen/session-history-bootstrap';

describe('buildSessionHistoryBootstrap', () => {
  it('returns null without prior messages', () => {
    assert.equal(
      buildSessionHistoryBootstrap([], { text: 'hello', attachments: [] }, 500),
      null,
    );
  });

  it('includes a chronological transcript suffix and the latest prompt', () => {
    const bootstrap = buildSessionHistoryBootstrap(
      [
        {
          id: 'message-1',
          role: 'user',
          text: 'Inspect the failing tests.',
          attachments: [],
          createdAt: '2026-03-16T12:00:00.000Z',
          completedAt: null,
          turnId: null,
          itemId: null,
          diff: null,
          activities: [],
        },
        {
          id: 'message-2',
          role: 'assistant',
          text: 'I found a broken assertion.',
          attachments: [],
          createdAt: '2026-03-16T12:00:05.000Z',
          completedAt: '2026-03-16T12:00:08.000Z',
          turnId: 'turn-1',
          itemId: null,
          diff: null,
          activities: [],
        },
      ],
      { text: 'Fix it.', attachments: [] },
      2_000,
    );

    assert.ok(bootstrap);
    assert.match(bootstrap!, /Transcript context:/);
    assert.match(bootstrap!, /USER:\nInspect the failing tests\./);
    assert.match(bootstrap!, /ASSISTANT:\nI found a broken assertion\./);
    assert.match(bootstrap!, /Latest user request \(answer this now\):\nFix it\./);
  });
});
