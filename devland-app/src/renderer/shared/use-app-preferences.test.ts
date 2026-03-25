import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_APP_PREFERENCES,
  sanitizeAppPreferences,
} from './use-app-preferences';

describe('sanitizeAppPreferences', () => {
  it('backfills Codex defaults for older stored preference payloads', () => {
    assert.deepEqual(
      sanitizeAppPreferences({
        externalEditor: {
          kind: 'detected',
          editorId: 'cursor',
          editorName: 'Cursor',
        },
      }),
      {
        externalEditor: {
          kind: 'detected',
          editorId: 'cursor',
          editorName: 'Cursor',
        },
        codexComposerSettings: DEFAULT_APP_PREFERENCES.codexComposerSettings,
      },
    );
  });

  it('keeps valid stored Codex defaults', () => {
    assert.deepEqual(
      sanitizeAppPreferences({
        externalEditor: null,
        codexComposerSettings: {
          model: 'gpt-5.3-codex-spark',
          reasoningEffort: 'low',
          fastMode: true,
          runtimeMode: 'full-access',
          interactionMode: 'plan',
        },
      }),
      {
        externalEditor: null,
        codexComposerSettings: {
          model: 'gpt-5.3-codex-spark',
          reasoningEffort: 'low',
          fastMode: true,
          runtimeMode: 'full-access',
          interactionMode: 'plan',
        },
      },
    );
  });
});
