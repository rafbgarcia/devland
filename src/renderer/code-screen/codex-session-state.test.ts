import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CodexSessionEvent } from '@/ipc/contracts';
import {
  applyCodexSessionEvent,
  DEFAULT_SESSION_STATE,
} from '@/renderer/code-screen/codex-session-state';

describe('applyCodexSessionEvent', () => {
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

    assert.equal(state.currentTurnActivities.length, 0);
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

    assert.equal(state.currentTurnActivities.length, 1);
    assert.equal(state.currentTurnActivities[0]?.label, 'Run command');
  });

  it('records reasoning activity as assistant progress without text', () => {
    const lifecycleEvent: CodexSessionEvent = {
      type: 'activity',
      sessionId: 'session-1',
      tone: 'info',
      phase: 'completed',
      label: 'Reasoning',
      detail: null,
      itemId: 'item-1',
      itemType: 'reasoning',
    };
    const completedEvent: CodexSessionEvent = {
      type: 'turn-completed',
      sessionId: 'session-1',
      status: 'completed',
      turnId: 'turn-1',
      error: null,
    };

    const withIgnoredActivity = applyCodexSessionEvent(DEFAULT_SESSION_STATE, lifecycleEvent);
    const completedState = applyCodexSessionEvent(withIgnoredActivity, completedEvent);

    assert.equal(completedState.messages.length, 1);
    assert.equal(completedState.messages[0]?.activities[0]?.label, 'Reasoning');
  });
});
