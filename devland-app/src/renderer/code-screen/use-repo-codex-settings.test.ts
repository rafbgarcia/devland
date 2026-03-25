import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_REPO_CODEX_SETTINGS,
  sanitizeRepoCodexSettings,
  sanitizeStoredRepoCodexSettings,
} from './use-repo-codex-settings';

describe('sanitizeRepoCodexSettings', () => {
  it('defaults browser control to off', () => {
    assert.deepEqual(
      sanitizeRepoCodexSettings({
        composerSettings: {
          model: 'gpt-5.3-codex-spark',
          reasoningEffort: 'low',
          fastMode: true,
          runtimeMode: 'full-access',
          interactionMode: 'plan',
        },
      }),
      {
        composerSettings: {
          model: 'gpt-5.3-codex-spark',
          reasoningEffort: 'low',
          fastMode: true,
          runtimeMode: 'full-access',
          interactionMode: 'plan',
        },
        browserControlEnabled: false,
      },
    );
  });

  it('falls back to repo defaults for malformed input', () => {
    assert.deepEqual(sanitizeRepoCodexSettings(null), DEFAULT_REPO_CODEX_SETTINGS);
  });
});

describe('sanitizeStoredRepoCodexSettings', () => {
  it('sanitizes repo keyed records and drops malformed repo ids', () => {
    assert.deepEqual(
      sanitizeStoredRepoCodexSettings({
        devland: {
          browserControlEnabled: true,
          composerSettings: {
            model: 'gpt-5.4',
            reasoningEffort: 'high',
            fastMode: false,
            runtimeMode: 'approval-required',
            interactionMode: 'default',
          },
        },
        '': {
          browserControlEnabled: true,
        },
      }),
      {
        devland: {
          browserControlEnabled: true,
          composerSettings: {
            model: 'gpt-5.4',
            reasoningEffort: 'high',
            fastMode: false,
            runtimeMode: 'approval-required',
            interactionMode: 'default',
          },
        },
      },
    );
  });
});
