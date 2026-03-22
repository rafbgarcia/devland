import assert from 'node:assert/strict';
import EventEmitter from 'node:events';
import { describe, it } from 'node:test';

import {
  buildCodexCollaborationMode,
  buildCodexThreadOpenParams,
  CodexAppServerManager,
  extractActivityFilePaths,
  buildCodexInitializeParams,
  buildCodexTurnStartParams,
  mapCodexRuntimeMode,
  parseCodexTurnPlanUpdate,
  parseCodexResumedThread,
  parseCodexThreadSummaries,
  shouldEmitCodexActivity,
} from '@/main-process/codex-app-server';

describe('buildCodexInitializeParams', () => {
  it('opts into Codex experimental api capabilities during initialize', () => {
    assert.deepEqual(buildCodexInitializeParams(), {
      clientInfo: {
        name: 'devland',
        title: 'Devland',
        version: process.env.npm_package_version ?? '0.0.0',
      },
      capabilities: {
        experimentalApi: true,
      },
    });
  });
});

describe('shouldEmitCodexActivity', () => {
  it('filters reasoning activity at the server boundary', () => {
    assert.equal(shouldEmitCodexActivity('reasoning'), false);
    assert.equal(shouldEmitCodexActivity('command_execution'), true);
    assert.equal(shouldEmitCodexActivity('plan'), true);
  });
});

describe('parseCodexTurnPlanUpdate', () => {
  it('extracts structured plan steps from turn updates', () => {
    assert.deepEqual(
      parseCodexTurnPlanUpdate({
        turnId: 'turn-1',
        explanation: 'Implement the plan UI',
        plan: [
          { step: 'Inspect current session state', status: 'completed' },
          { step: 'Render the pinned task card', status: 'inProgress' },
          { step: 'Verify the animation', status: 'unknown' },
        ],
      }),
      {
        turnId: 'turn-1',
        explanation: 'Implement the plan UI',
        plan: [
          { step: 'Inspect current session state', status: 'completed' },
          { step: 'Render the pinned task card', status: 'inProgress' },
          { step: 'Verify the animation', status: 'pending' },
        ],
      },
    );
  });

  it('returns null when no valid plan steps are present', () => {
    assert.equal(
      parseCodexTurnPlanUpdate({
        turnId: 'turn-1',
        plan: [{ status: 'completed' }],
      }),
      null,
    );
  });
});

describe('mapCodexRuntimeMode', () => {
  it('maps supervised mode to approval-gated workspace write access', () => {
    assert.deepEqual(mapCodexRuntimeMode('approval-required'), {
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
    });
  });

  it('maps full access mode to unrestricted Codex access', () => {
    assert.deepEqual(mapCodexRuntimeMode('full-access'), {
      approvalPolicy: 'never',
      sandbox: 'danger-full-access',
    });
  });
});

describe('buildCodexThreadOpenParams', () => {
  it('passes model, fast service tier, and runtime settings into thread open params', () => {
    assert.deepEqual(
      buildCodexThreadOpenParams({
        cwd: '/repo',
        settings: {
          model: 'gpt-5.4',
          reasoningEffort: 'high',
          fastMode: true,
          runtimeMode: 'full-access',
          interactionMode: 'default',
        },
      }),
      {
        cwd: '/repo',
        model: 'gpt-5.4',
        serviceTier: 'fast',
        approvalPolicy: 'never',
        sandbox: 'danger-full-access',
        experimentalRawEvents: false,
        persistExtendedHistory: true,
      },
    );
  });
});

describe('buildCodexTurnStartParams', () => {
  it('passes prompt text, reasoning, fast mode, and image attachments to turn/start', () => {
    assert.deepEqual(
      buildCodexTurnStartParams({
        threadId: 'thread-1',
        prompt: 'Review this UI',
        settings: {
          model: 'gpt-5.4',
          reasoningEffort: 'xhigh',
          fastMode: true,
          runtimeMode: 'approval-required',
          interactionMode: 'default',
        },
        attachments: [
          {
            type: 'image',
            name: 'composer.png',
            mimeType: 'image/png',
            sizeBytes: 1234,
            dataUrl: 'data:image/png;base64,abc',
          },
        ],
      }),
      {
        threadId: 'thread-1',
        input: [
          { type: 'text', text: 'Review this UI', text_elements: [] },
          { type: 'image', url: 'data:image/png;base64,abc' },
        ],
        model: 'gpt-5.4',
        effort: 'xhigh',
        collaborationMode: buildCodexCollaborationMode({
          interactionMode: 'default',
          model: 'gpt-5.4',
          reasoningEffort: 'xhigh',
        }),
        serviceTier: 'fast',
      },
    );
  });

  it('allows attachment-only turns', () => {
    assert.deepEqual(
      buildCodexTurnStartParams({
        threadId: 'thread-2',
        prompt: '   ',
        settings: {
          model: 'gpt-5.3-codex',
          reasoningEffort: 'medium',
          fastMode: false,
          runtimeMode: 'approval-required',
          interactionMode: 'default',
        },
        attachments: [
          {
            type: 'image',
            name: 'issue.png',
            mimeType: 'image/png',
            sizeBytes: 456,
            dataUrl: 'data:image/png;base64,xyz',
          },
        ],
      }),
      {
        threadId: 'thread-2',
        input: [{ type: 'image', url: 'data:image/png;base64,xyz' }],
        model: 'gpt-5.3-codex',
        effort: 'medium',
        collaborationMode: buildCodexCollaborationMode({
          interactionMode: 'default',
          model: 'gpt-5.3-codex',
          reasoningEffort: 'medium',
        }),
      },
    );
  });

  it('passes plan mode as Codex collaboration mode on turn/start', () => {
    assert.deepEqual(
      buildCodexTurnStartParams({
        threadId: 'thread-3',
        prompt: 'Plan the implementation',
        settings: {
          model: 'gpt-5.3-codex',
          reasoningEffort: 'high',
          fastMode: false,
          runtimeMode: 'approval-required',
          interactionMode: 'plan',
        },
        attachments: [],
      }),
      {
        threadId: 'thread-3',
        input: [{ type: 'text', text: 'Plan the implementation', text_elements: [] }],
        model: 'gpt-5.3-codex',
        effort: 'high',
        collaborationMode: buildCodexCollaborationMode({
          interactionMode: 'plan',
          model: 'gpt-5.3-codex',
          reasoningEffort: 'high',
        }),
      },
    );
  });
});

describe('parseCodexThreadSummaries', () => {
  it('extracts thread list rows used by the renderer history menu', () => {
    assert.deepEqual(
      parseCodexThreadSummaries({
        data: [
          {
            id: 'thread-1',
            name: 'Fix composer previews',
            preview: 'Investigate the broken image preview',
            cwd: '/repo',
            createdAt: 1710000000,
            updatedAt: 1710000300,
          },
          {
            id: '',
            preview: 'invalid',
            cwd: '/repo',
            createdAt: 1710000000,
            updatedAt: 1710000300,
          },
        ],
      }),
      [
        {
          id: 'thread-1',
          name: 'Fix composer previews',
          preview: 'Investigate the broken image preview',
          cwd: '/repo',
          createdAt: 1710000000,
          updatedAt: 1710000300,
        },
      ],
    );
  });
});

describe('parseCodexResumedThread', () => {
  it('maps resumed thread turns into renderer message history', () => {
    assert.deepEqual(
      parseCodexResumedThread({
        thread: {
          id: 'thread-1',
          createdAt: 1710000000,
          updatedAt: 1710000300,
          turns: [
            {
              id: 'turn-1',
              status: 'completed',
              items: [
                {
                  id: 'user-1',
                  type: 'userMessage',
                  content: [
                    { type: 'text', text: 'Fix the history icon' },
                    { type: 'localImage', path: '/tmp/screenshot.png' },
                  ],
                },
                {
                  id: 'assistant-1',
                  type: 'agentMessage',
                  text: 'I will investigate it.',
                },
              ],
            },
          ],
        },
      }),
      {
        threadId: 'thread-1',
        messages: [
          {
            id: 'user-1',
            role: 'user',
            text: 'Fix the history icon\n\n[Attached image: screenshot.png]',
            createdAt: '2024-03-09T16:00:00.000Z',
            completedAt: '2024-03-09T16:00:00.000Z',
            turnId: 'turn-1',
            itemId: 'user-1',
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            text: 'I will investigate it.',
            createdAt: '2024-03-09T16:00:01.000Z',
            completedAt: '2024-03-09T16:00:01.000Z',
            turnId: 'turn-1',
            itemId: 'assistant-1',
          },
        ],
      },
    );
  });

  it('dedupes repeated upstream item ids when resumed turns replay prior messages', () => {
    assert.deepEqual(
      parseCodexResumedThread({
        thread: {
          id: 'thread-1',
          createdAt: 1710000000,
          updatedAt: 1710000300,
          turns: [
            {
              id: 'turn-1',
              status: 'completed',
              items: [
                {
                  id: '689a3c40-8985-4135-904f-f1e0cccdec33:root:user:4',
                  type: 'userMessage',
                  content: [{ type: 'text', text: 'First prompt' }],
                },
                {
                  id: '689a3c40-8985-4135-904f-f1e0cccdec33:root:assistant:5',
                  type: 'agentMessage',
                  text: 'First answer',
                },
              ],
            },
            {
              id: 'turn-2',
              status: 'completed',
              items: [
                {
                  id: '689a3c40-8985-4135-904f-f1e0cccdec33:root:user:4',
                  type: 'userMessage',
                  content: [{ type: 'text', text: 'First prompt' }],
                },
                {
                  id: '689a3c40-8985-4135-904f-f1e0cccdec33:root:assistant:5',
                  type: 'agentMessage',
                  text: 'First answer, revised',
                },
                {
                  id: '689a3c40-8985-4135-904f-f1e0cccdec33:root:user:6',
                  type: 'userMessage',
                  content: [{ type: 'text', text: 'Second prompt' }],
                },
                {
                  id: '689a3c40-8985-4135-904f-f1e0cccdec33:root:assistant:7',
                  type: 'agentMessage',
                  text: 'Second answer',
                },
              ],
            },
          ],
        },
      }),
      {
        threadId: 'thread-1',
        messages: [
          {
            id: '689a3c40-8985-4135-904f-f1e0cccdec33:root:user:4',
            role: 'user',
            text: 'First prompt',
            createdAt: '2024-03-09T16:00:00.000Z',
            completedAt: '2024-03-09T16:00:00.000Z',
            turnId: 'turn-1',
            itemId: '689a3c40-8985-4135-904f-f1e0cccdec33:root:user:4',
          },
          {
            id: '689a3c40-8985-4135-904f-f1e0cccdec33:root:assistant:5',
            role: 'assistant',
            text: 'First answer, revised',
            createdAt: '2024-03-09T16:00:01.000Z',
            completedAt: '2024-03-09T16:00:03.000Z',
            turnId: 'turn-1',
            itemId: '689a3c40-8985-4135-904f-f1e0cccdec33:root:assistant:5',
          },
          {
            id: '689a3c40-8985-4135-904f-f1e0cccdec33:root:user:6',
            role: 'user',
            text: 'Second prompt',
            createdAt: '2024-03-09T16:00:04.000Z',
            completedAt: '2024-03-09T16:00:04.000Z',
            turnId: 'turn-2',
            itemId: '689a3c40-8985-4135-904f-f1e0cccdec33:root:user:6',
          },
          {
            id: '689a3c40-8985-4135-904f-f1e0cccdec33:root:assistant:7',
            role: 'assistant',
            text: 'Second answer',
            createdAt: '2024-03-09T16:00:05.000Z',
            completedAt: '2024-03-09T16:00:05.000Z',
            turnId: 'turn-2',
            itemId: '689a3c40-8985-4135-904f-f1e0cccdec33:root:assistant:7',
          },
        ],
      },
    );
  });
});

describe('extractActivityFilePaths', () => {
  it('collects best-effort file paths from nested file-change payloads in order', () => {
    assert.deepEqual(
      extractActivityFilePaths('file_change', {
        path: 'src/one.ts',
        changes: [
          { path: 'src/two.ts' },
          { file_path: 'src/three.ts' },
        ],
        edits: {
          files: [
            { oldPath: 'src/four-before.ts', path: 'src/four.ts' },
            { path: 'src/two.ts' },
          ],
        },
      }),
      ['src/one.ts', 'src/two.ts', 'src/three.ts', 'src/four-before.ts', 'src/four.ts'],
    );
  });

  it('returns no file paths for non-file-change activity', () => {
    assert.deepEqual(
      extractActivityFilePaths('command_execution', { path: 'src/ignored.ts' }),
      [],
    );
  });
});

describe('CodexAppServerManager turn completion events', () => {
  it('emits turn-completed before the ready state so transcript rows do not flicker', async () => {
    const manager = new CodexAppServerManager();
    const events: Array<{ type: string }> = [];

    manager.on('event', (event) => {
      events.push(event);
    });

    (manager as unknown as { captureTurnDiff: () => Promise<null> }).captureTurnDiff =
      async () => null;

    await (
      manager as unknown as {
        handleNotification: (context: Record<string, unknown>, notification: Record<string, unknown>) => Promise<void>;
      }
    ).handleNotification(
      {
        sessionId: 'session-1',
        cwd: '/repo',
        threadId: 'thread-1',
        status: 'running',
        activeTurnId: 'turn-1',
        activeTurnStartSnapshot: null,
        child: { stderr: new EventEmitter() },
        output: null,
        pending: new Map(),
        pendingApprovals: new Map(),
        pendingUserInputs: new Map(),
        stopped: false,
      },
      {
        method: 'turn/completed',
        params: {
          turn: {
            id: 'turn-1',
            status: 'completed',
          },
        },
      },
    );

    assert.equal(events[0]?.type, 'turn-completed');
    assert.equal(events[1]?.type, 'state');
  });
});
