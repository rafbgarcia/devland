import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveChatComposerRuntimeState } from '@/renderer/code-screen/chat-composer.logic';

describe('chat-composer runtime state', () => {
  it('keeps follow-up editing enabled while Codex is running', () => {
    assert.deepEqual(
      deriveChatComposerRuntimeState({
        isRunning: true,
        isSending: false,
      }),
      {
        isInputDisabled: false,
        canSubmitPrompt: true,
        showInterruptAction: true,
      },
    );
  });

  it('locks the composer only while a prompt submission is in flight', () => {
    assert.deepEqual(
      deriveChatComposerRuntimeState({
        isRunning: false,
        isSending: true,
      }),
      {
        isInputDisabled: false,
        canSubmitPrompt: false,
        showInterruptAction: false,
      },
    );
  });
});
