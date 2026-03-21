import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_EXTENSION_ICON_NAME,
  isExtensionIconName,
  resolveExtensionIconName,
} from '@/renderer/shared/lib/extension-icons';

describe('extension icon helpers', () => {
  it('accepts valid lucide icon names', () => {
    assert.equal(isExtensionIconName('git-pull-request'), true);
    assert.equal(resolveExtensionIconName('git-pull-request'), 'git-pull-request');
  });

  it('falls back for unknown icon names', () => {
    assert.equal(isExtensionIconName('gh-issue'), false);
    assert.equal(resolveExtensionIconName('gh-issue'), DEFAULT_EXTENSION_ICON_NAME);
  });
});
