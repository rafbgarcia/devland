import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_CODEX_COMPOSER_SETTINGS,
  sanitizeCodexComposerSettings,
} from './codex-chat';

describe('sanitizeCodexComposerSettings', () => {
  it('returns defaults when storage is missing or invalid', () => {
    assert.deepEqual(
      sanitizeCodexComposerSettings(null),
      DEFAULT_CODEX_COMPOSER_SETTINGS,
    );
  });

  it('preserves a valid stored settings object', () => {
    assert.deepEqual(
      sanitizeCodexComposerSettings({
        model: 'gpt-5.3-codex',
        reasoningEffort: 'medium',
        fastMode: true,
        runtimeMode: 'full-access',
        interactionMode: 'plan',
      }),
      {
        model: 'gpt-5.3-codex',
        reasoningEffort: 'medium',
        fastMode: true,
        runtimeMode: 'full-access',
        interactionMode: 'plan',
      },
    );
  });

  it('falls back field-by-field for invalid stored values', () => {
    assert.deepEqual(
      sanitizeCodexComposerSettings({
        model: '   ',
        reasoningEffort: 'invalid',
        fastMode: 'yes',
        runtimeMode: 'danger',
        interactionMode: 'chat',
      }),
      DEFAULT_CODEX_COMPOSER_SETTINGS,
    );
  });
});
