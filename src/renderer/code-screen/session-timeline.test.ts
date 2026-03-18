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
  it('keeps transcript rows in message and work order', () => {
    const rows = deriveSessionTimelineRows({
      ...DEFAULT_SESSION_STATE,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          text: 'Fix the app',
          attachments: [],
          createdAt: '2026-03-16T12:00:00.000Z',
          completedAt: null,
          turnId: 'turn-1',
          itemId: null,
          diff: null,
          activities: [],
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          text: 'Checking the workspace.',
          attachments: [],
          createdAt: '2026-03-16T12:00:00.000Z',
          completedAt: '2026-03-16T12:00:05.000Z',
          turnId: 'turn-1',
          itemId: 'assistant-item-1',
          diff: null,
          activities: [],
        },
        {
          id: 'assistant-2',
          role: 'assistant',
          text: 'Done.',
          attachments: [],
          createdAt: '2026-03-16T12:00:03.000Z',
          completedAt: '2026-03-16T12:00:05.000Z',
          turnId: 'turn-1',
          itemId: 'assistant-item-2',
          diff: null,
          activities: [],
        },
      ],
      transcriptEntries: [
        {
          id: 'user-1',
          kind: 'message',
          message: {
            id: 'user-1',
            role: 'user',
            text: 'Fix the app',
            attachments: [],
            createdAt: '2026-03-16T12:00:00.000Z',
            completedAt: null,
            turnId: 'turn-1',
            itemId: null,
            diff: null,
            activities: [],
          },
        },
        {
          id: 'assistant-1',
          kind: 'message',
          message: {
            id: 'assistant-1',
            role: 'assistant',
            text: 'Checking the workspace.',
            attachments: [],
            createdAt: '2026-03-16T12:00:00.000Z',
            completedAt: '2026-03-16T12:00:05.000Z',
            turnId: 'turn-1',
            itemId: 'assistant-item-1',
            diff: null,
            activities: [],
          },
        },
        {
          id: 'work-1',
          kind: 'work',
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
        {
          id: 'assistant-2',
          kind: 'message',
          message: {
            id: 'assistant-2',
            role: 'assistant',
            text: 'Done.',
            attachments: [],
            createdAt: '2026-03-16T12:00:03.000Z',
            completedAt: '2026-03-16T12:00:05.000Z',
            turnId: 'turn-1',
            itemId: 'assistant-item-2',
            diff: null,
            activities: [],
          },
        },
      ],
    });

    assert.equal(rows.length, 4);
    assert.equal(rows[0]?.kind, 'message');
    assert.equal(rows[1]?.kind, 'message');
    assert.equal(rows[2]?.kind, 'work');
    assert.equal(rows[3]?.kind, 'message');
  });

  it('keeps the current turn unvirtualized in event order while running', () => {
    const rows = deriveSessionTimelineRows({
      ...DEFAULT_SESSION_STATE,
      status: 'running',
      currentTurnEntries: [
        {
          id: 'assistant-1',
          kind: 'message',
          message: {
            id: 'assistant-1',
            role: 'assistant',
            text: 'Working through it',
            attachments: [],
            createdAt: '2026-03-16T12:00:00.000Z',
            completedAt: null,
            turnId: 'turn-2',
            itemId: 'assistant-item-1',
            diff: null,
            activities: [],
          },
        },
        {
          id: 'work-1',
          kind: 'work',
          activities: [
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
        },
        {
          id: 'assistant-2',
          kind: 'message',
          message: {
            id: 'assistant-2',
            role: 'assistant',
            text: 'Almost done',
            attachments: [],
            createdAt: '2026-03-16T12:00:01.000Z',
            completedAt: null,
            turnId: 'turn-2',
            itemId: 'assistant-item-2',
            diff: null,
            activities: [],
          },
        },
      ],
    });

    assert.equal(rows.length, 3);
    assert.equal(rows[0]?.kind, 'message');
    assert.equal(rows[0]?.kind === 'message' ? rows[0].isStreaming : false, false);
    assert.equal(rows[1]?.kind, 'work');
    assert.equal(rows[2]?.kind, 'message');
    assert.equal(rows[2]?.kind === 'message' ? rows[2].isStreaming : false, true);
  });

  it('does not mark transcript assistant messages as streaming while a new turn runs', () => {
    const rows = deriveSessionTimelineRows({
      ...DEFAULT_SESSION_STATE,
      status: 'running',
      transcriptEntries: [
        {
          id: 'assistant-history',
          kind: 'message',
          message: {
            id: 'assistant-history',
            role: 'assistant',
            text: 'Previous answer',
            attachments: [],
            createdAt: '2026-03-16T11:59:00.000Z',
            completedAt: '2026-03-16T11:59:01.000Z',
            turnId: 'turn-1',
            itemId: 'assistant-item-history',
            diff: null,
            activities: [],
          },
        },
      ],
      currentTurnEntries: [
        {
          id: 'assistant-current',
          kind: 'message',
          message: {
            id: 'assistant-current',
            role: 'assistant',
            text: 'Current answer',
            attachments: [],
            createdAt: '2026-03-16T12:00:00.000Z',
            completedAt: null,
            turnId: 'turn-2',
            itemId: 'assistant-item-current',
            diff: null,
            activities: [],
          },
        },
      ],
    });

    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.kind === 'message' ? rows[0].isStreaming : false, false);
    assert.equal(rows[1]?.kind === 'message' ? rows[1].isStreaming : false, true);
  });
});
