import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  deriveChatComposerRuntimeState,
  shouldRestoreFailedComposerDraft,
} from '@/renderer/code-screen/chat-composer.logic';

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

  it('restores a failed submission only when the composer is still empty', () => {
    assert.equal(
      shouldRestoreFailedComposerDraft({
        prompt: '',
        attachmentCount: 0,
      }),
      true,
    );
    assert.equal(
      shouldRestoreFailedComposerDraft({
        prompt: 'new draft',
        attachmentCount: 0,
      }),
      false,
    );
    assert.equal(
      shouldRestoreFailedComposerDraft({
        prompt: '',
        attachmentCount: 2,
      }),
      false,
    );
  });
});
