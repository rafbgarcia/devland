import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCodexThreadOpenParams,
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
});
