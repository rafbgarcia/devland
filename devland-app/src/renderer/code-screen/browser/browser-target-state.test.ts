import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDefaultBrowserSnapshot,
  getRememberedBrowserUrl,
  sanitizeStoredBrowserState,
  setRememberedBrowserUrl,
} from '@/renderer/code-screen/browser/browser-target-state';

describe('sanitizeStoredBrowserState', () => {
  it('keeps only valid browser target records', () => {
    assert.deepEqual(
      sanitizeStoredBrowserState({
        'target-a': {
          lastUrl: 'http://localhost:3000',
        },
        'target-b': {
          lastUrl: 42,
        },
        'target-c': null,
        'target-d': 'invalid',
      }),
      {
        'target-a': {
          lastUrl: 'http://localhost:3000',
        },
        'target-b': {
          lastUrl: null,
        },
      },
    );
  });

  it('falls back to an empty state for malformed values', () => {
    assert.deepEqual(sanitizeStoredBrowserState(null), {});
    assert.deepEqual(sanitizeStoredBrowserState('oops'), {});
  });
});

describe('setRememberedBrowserUrl', () => {
  it('stores a remembered url per target without disturbing others', () => {
    const nextState = setRememberedBrowserUrl(
      {
        'target-a': {
          lastUrl: 'http://localhost:3000',
        },
      },
      'target-b',
      ' https://example.com/dashboard ',
    );

    assert.deepEqual(nextState, {
      'target-a': {
        lastUrl: 'http://localhost:3000',
      },
      'target-b': {
        lastUrl: 'https://example.com/dashboard',
      },
    });
  });

  it('removes the remembered url when it is cleared', () => {
    const nextState = setRememberedBrowserUrl(
      {
        'target-a': {
          lastUrl: 'http://localhost:3000',
        },
        'target-b': {
          lastUrl: 'https://example.com',
        },
      },
      'target-a',
      '   ',
    );

    assert.deepEqual(nextState, {
      'target-b': {
        lastUrl: 'https://example.com',
      },
    });
  });
});

describe('getRememberedBrowserUrl', () => {
  it('returns an empty string when the target has no remembered url', () => {
    assert.equal(getRememberedBrowserUrl({}, 'missing-target'), '');
  });
});

describe('createDefaultBrowserSnapshot', () => {
  it('starts targets on a blank, idle page', () => {
    assert.deepEqual(createDefaultBrowserSnapshot('target-a'), {
      targetId: 'target-a',
      currentUrl: 'about:blank',
      pageTitle: '',
      canGoBack: false,
      canGoForward: false,
      isLoading: false,
      isVisible: false,
      lastLoadError: null,
    });
  });
});
