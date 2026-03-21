import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CodexSessionEvent } from '@/ipc/contracts';
import {
  applyCodexSessionEvent,
  DEFAULT_SESSION_STATE,
  hydrateCodexSessionState,
  toCodexSessionSnapshot,
} from '@/renderer/code-screen/codex-session-state';

describe('applyCodexSessionEvent', () => {
  it('tracks the latest structured turn plan separately from transcript activity', () => {
    const state = applyCodexSessionEvent(DEFAULT_SESSION_STATE, {
      type: 'turn-plan-updated',
      sessionId: 'session-1',
      turnId: 'turn-1',
      explanation: 'Implement the live plan card',
      plan: [
        { step: 'Add the structured event', status: 'completed' },
        { step: 'Render the pinned plan', status: 'inProgress' },
      ],
    });

    assert.deepEqual(state.activePlan, {
      turnId: 'turn-1',
      explanation: 'Implement the live plan card',
      plan: [
        { step: 'Add the structured event', status: 'completed' },
        { step: 'Render the pinned plan', status: 'inProgress' },
      ],
    });
    assert.equal(state.currentTurnEntries.length, 0);
  });

  it('ignores non-tool lifecycle activities', () => {
    const event: CodexSessionEvent = {
      type: 'activity',
      sessionId: 'session-1',
      tone: 'info',
      phase: 'started',
      label: 'User message',
      detail: null,
      itemId: 'item-1',
      itemType: 'user_message',
    };

    const state = applyCodexSessionEvent(DEFAULT_SESSION_STATE, event);

    assert.equal(state.currentTurnEntries.length, 0);
  });

  it('ignores plan activity rows once structured plans are available', () => {
    const event: CodexSessionEvent = {
      type: 'activity',
      sessionId: 'session-1',
      tone: 'info',
      phase: 'updated',
      label: 'Plan',
      detail: 'Drafting tasks',
      itemId: 'item-1',
      itemType: 'plan',
    };

    const state = applyCodexSessionEvent(DEFAULT_SESSION_STATE, event);

    assert.equal(state.currentTurnEntries.length, 0);
  });

  it('keeps tool lifecycle activities', () => {
    const event: CodexSessionEvent = {
      type: 'activity',
      sessionId: 'session-1',
      tone: 'tool',
      phase: 'started',
      label: 'Run command',
      detail: 'git status',
      itemId: 'item-1',
      itemType: 'command_execution',
    };

    const state = applyCodexSessionEvent(DEFAULT_SESSION_STATE, event);
    const workEntry = state.currentTurnEntries[0];

    assert.equal(state.currentTurnEntries.length, 1);
    assert.equal(workEntry?.kind, 'work');
    assert.equal(workEntry?.kind === 'work' ? workEntry.activities[0]?.label : null, 'Run command');
  });

  it('preserves assistant messages and tool work in turn order', () => {
    const startingState = {
      ...DEFAULT_SESSION_STATE,
      messages: [
        {
          id: 'user-1',
          role: 'user' as const,
          text: 'Fix the app',
          attachments: [],
          createdAt: '2026-03-16T12:00:00.000Z',
          completedAt: null,
          turnId: null,
          itemId: null,
          diff: null,
          activities: [],
        },
      ],
      transcriptEntries: [
        {
          id: 'user-1',
          kind: 'message' as const,
          message: {
            id: 'user-1',
            role: 'user' as const,
            text: 'Fix the app',
            attachments: [],
            createdAt: '2026-03-16T12:00:00.000Z',
            completedAt: null,
            turnId: null,
            itemId: null,
            diff: null,
            activities: [],
          },
        },
      ],
      turnId: 'turn-1',
      status: 'running' as const,
    };
    const firstDeltaEvent: CodexSessionEvent = {
      type: 'assistant-delta',
      sessionId: 'session-1',
      itemId: 'assistant-item-1',
      text: 'Checking the workspace.',
    };
    const lifecycleEvent: CodexSessionEvent = {
      type: 'activity',
      sessionId: 'session-1',
      tone: 'tool',
      phase: 'completed',
      label: 'Run command',
      detail: 'git status',
      itemId: 'tool-item-1',
      itemType: 'command_execution',
    };
    const secondDeltaEvent: CodexSessionEvent = {
      type: 'assistant-delta',
      sessionId: 'session-1',
      itemId: 'assistant-item-2',
      text: 'Applied the fix.',
    };
    const completedEvent: CodexSessionEvent = {
      type: 'turn-completed',
      sessionId: 'session-1',
      status: 'completed',
      turnId: 'turn-1',
      error: null,
    };

    const withFirstMessage = applyCodexSessionEvent(startingState, firstDeltaEvent);
    const withActivity = applyCodexSessionEvent(withFirstMessage, lifecycleEvent);
    const withSecondMessage = applyCodexSessionEvent(withActivity, secondDeltaEvent);
    const completedState = applyCodexSessionEvent(withSecondMessage, completedEvent);

    assert.equal(completedState.messages.length, 3);
    assert.equal(completedState.messages[0]?.turnId, 'turn-1');
    assert.equal(completedState.messages[1]?.text, 'Checking the workspace.');
    assert.equal(completedState.messages[2]?.text, 'Applied the fix.');
    assert.deepEqual(
      completedState.transcriptEntries.map((entry) =>
        entry.kind === 'message' ? `${entry.kind}:${entry.message.role}` : entry.kind,
      ),
      ['message:user', 'message:assistant', 'work', 'message:assistant'],
    );
  });

  it('clears the previous plan when a new turn starts', () => {
    const startingState = {
      ...DEFAULT_SESSION_STATE,
      turnId: 'turn-1',
      activePlan: {
        turnId: 'turn-1',
        explanation: 'Old plan',
        plan: [{ step: 'Old step', status: 'inProgress' as const }],
      },
    };

    const state = applyCodexSessionEvent(startingState, {
      type: 'state',
      sessionId: 'session-1',
      status: 'running',
      turnId: 'turn-2',
    });

    assert.equal(state.activePlan, null);
  });

  it('keeps the last plan after turn completion for post-run collapsed display', () => {
    const startingState = {
      ...DEFAULT_SESSION_STATE,
      turnId: 'turn-1',
      status: 'running' as const,
      activePlan: {
        turnId: 'turn-1',
        explanation: 'Active plan',
        plan: [{ step: 'Current step', status: 'inProgress' as const }],
      },
    };

    const state = applyCodexSessionEvent(startingState, {
      type: 'turn-completed',
      sessionId: 'session-1',
      turnId: 'turn-1',
      status: 'completed',
      error: null,
    });

    assert.deepEqual(state.activePlan, startingState.activePlan);
  });
});

describe('Codex session snapshot persistence', () => {
  it('preserves the active plan across snapshot hydration', () => {
    const state = {
      ...DEFAULT_SESSION_STATE,
      threadId: 'thread-1',
      status: 'ready' as const,
      activePlan: {
        turnId: 'turn-1',
        explanation: 'Keep the last plan visible after restart',
        plan: [
          { step: 'Persist the snapshot', status: 'completed' as const },
          { step: 'Hydrate the plan UI', status: 'inProgress' as const },
        ],
      },
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant' as const,
          text: 'Plan is ready.',
          attachments: [],
          createdAt: '2026-03-21T12:00:00.000Z',
          completedAt: '2026-03-21T12:00:01.000Z',
          turnId: 'turn-1',
          itemId: null,
          diff: null,
          activities: [],
        },
      ],
      transcriptEntries: [
        {
          id: 'assistant-1',
          kind: 'message' as const,
          message: {
            id: 'assistant-1',
            role: 'assistant' as const,
            text: 'Plan is ready.',
            attachments: [],
            createdAt: '2026-03-21T12:00:00.000Z',
            completedAt: '2026-03-21T12:00:01.000Z',
            turnId: 'turn-1',
            itemId: null,
            diff: null,
            activities: [],
          },
        },
      ],
    };

    const snapshot = toCodexSessionSnapshot(state);

    assert.ok(snapshot);
    assert.deepEqual(snapshot.activePlan, state.activePlan);

    const hydratedState = hydrateCodexSessionState(snapshot);

    assert.deepEqual(hydratedState.activePlan, state.activePlan);
    assert.equal(hydratedState.threadId, 'thread-1');
    assert.equal(hydratedState.messages[0]?.text, 'Plan is ready.');
  });
});
