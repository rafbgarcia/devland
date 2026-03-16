import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_SESSION_STATE } from '@/renderer/code-screen/codex-session-state';
import {
  compactSessionActivities,
  deriveSessionTimelineRows,
} from '@/renderer/code-screen/session-timeline';

describe('compactSessionActivities', () => {
  it('collapses started and completed events for the same tool item', () => {
    const entries = compactSessionActivities([
      {
        id: 'activity-1',
        tone: 'tool',
        phase: 'started',
        label: 'Run command',
        detail: 'git status',
        itemId: 'item-1',
        itemType: 'command_execution',
      },
      {
        id: 'activity-2',
        tone: 'tool',
        phase: 'completed',
        label: 'Run command',
        detail: 'git status',
        itemId: 'item-1',
        itemType: 'command_execution',
      },
    ]);

    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.status, 'completed');
  });

  it('keeps distinct tool items separate', () => {
    const entries = compactSessionActivities([
      {
        id: 'activity-1',
        tone: 'tool',
        phase: 'started',
        label: 'Run command',
        detail: 'git status',
        itemId: 'item-1',
        itemType: 'command_execution',
      },
      {
        id: 'activity-2',
        tone: 'tool',
        phase: 'started',
        label: 'Edit files',
        detail: 'src/App.tsx',
        itemId: 'item-2',
        itemType: 'file_change',
      },
    ]);

    assert.equal(entries.length, 2);
  });
});

describe('deriveSessionTimelineRows', () => {
  it('emits a tool row ahead of assistant messages that contain tool activity', () => {
    const rows = deriveSessionTimelineRows({
      ...DEFAULT_SESSION_STATE,
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Done.',
          createdAt: '2026-03-16T12:00:00.000Z',
          completedAt: '2026-03-16T12:00:05.000Z',
          turnId: 'turn-1',
          diff: null,
          activities: [
            {
              id: 'activity-1',
              tone: 'tool',
              phase: 'completed',
              label: 'Run command',
              detail: 'git status',
              itemId: 'item-1',
              itemType: 'command_execution',
            },
          ],
        },
      ],
    });

    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.kind, 'work');
    assert.equal(rows[1]?.kind, 'message');
  });

  it('keeps the current turn unvirtualized as work plus streaming message while running', () => {
    const rows = deriveSessionTimelineRows({
      ...DEFAULT_SESSION_STATE,
      status: 'running',
      streamingAssistantText: 'Working through it',
      currentTurnActivities: [
        {
          id: 'activity-1',
          tone: 'tool',
          phase: 'started',
          label: 'Search the web',
          detail: 'api docs',
          itemId: 'item-1',
          itemType: 'web_search',
        },
      ],
    });

    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.kind, 'work');
    assert.equal(rows[1]?.kind, 'streaming-message');
  });
});
