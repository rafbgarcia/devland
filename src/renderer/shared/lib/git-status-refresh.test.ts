import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CodexSessionEvent } from '@/ipc/contracts';
import { getGitStatusRefreshRequestForCodexEvent } from '@/renderer/shared/lib/git-status-refresh';

describe('getGitStatusRefreshRequestForCodexEvent', () => {
  it('refreshes after repo-affecting tool completions', () => {
    const event: CodexSessionEvent = {
      type: 'activity',
      sessionId: 'session-1',
      tone: 'tool',
      phase: 'completed',
      label: 'Run command',
      detail: 'git status',
      itemId: 'item-1',
      itemType: 'command_execution',
    };

    assert.deepEqual(
      getGitStatusRefreshRequestForCodexEvent(event, '/tmp/repo'),
      { repoPath: '/tmp/repo', reason: 'codex-tool-completed' },
    );
  });

  it('ignores non-mutating tool completions', () => {
    const event: CodexSessionEvent = {
      type: 'activity',
      sessionId: 'session-1',
      tone: 'tool',
      phase: 'completed',
      label: 'Search the web',
      detail: 'latest docs',
      itemId: 'item-1',
      itemType: 'web_search',
    };

    assert.equal(
      getGitStatusRefreshRequestForCodexEvent(event, '/tmp/repo'),
      null,
    );
  });

  it('refreshes when a turn completes', () => {
    const event: CodexSessionEvent = {
      type: 'turn-completed',
      sessionId: 'session-1',
      turnId: 'turn-1',
      status: 'completed',
      completedAt: '2026-03-17T12:00:00.000Z',
      diff: null,
    };

    assert.deepEqual(
      getGitStatusRefreshRequestForCodexEvent(event, '/tmp/repo'),
      { repoPath: '/tmp/repo', reason: 'codex-turn-completed' },
    );
  });
});
