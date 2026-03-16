import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shouldHandleGitStateWatchEvent } from '@/main-process/git-state-watcher';

describe('shouldHandleGitStateWatchEvent', () => {
  it('filters root events down to meaningful git metadata files', () => {
    assert.equal(shouldHandleGitStateWatchEvent('root', 'HEAD'), true);
    assert.equal(shouldHandleGitStateWatchEvent('root', 'packed-refs'), true);
    assert.equal(shouldHandleGitStateWatchEvent('root', 'logs'), false);
    assert.equal(shouldHandleGitStateWatchEvent('root', 'config'), false);
    assert.equal(shouldHandleGitStateWatchEvent('root', null), false);
  });

  it('always accepts ref directory events', () => {
    assert.equal(shouldHandleGitStateWatchEvent('refs', 'main'), true);
    assert.equal(shouldHandleGitStateWatchEvent('refs', null), true);
  });
});
