import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDefaultBrowserSnapshot,
  getRememberedBrowserPageTitle,
  getRememberedBrowserUrl,
  sanitizeStoredBrowserViewState,
  setRememberedBrowserUrl,
  syncBrowserViewSnapshot,
} from '@/renderer/code-screen/browser/browser-view-state';

describe('sanitizeStoredBrowserViewState', () => {
  it('keeps only valid browser view records', () => {
    assert.deepEqual(
      sanitizeStoredBrowserViewState({
        'view-a': {
          codeTargetId: 'target-a',
          lastUrl: 'http://localhost:3000',
          pageTitle: 'App',
        },
        'view-b': {
          codeTargetId: '',
          lastUrl: 'https://example.com',
        },
        'view-c': {
          codeTargetId: 'target-c',
          lastUrl: 42,
        },
        'view-d': null,
      }),
      {
        'view-a': {
          codeTargetId: 'target-a',
          lastUrl: 'http://localhost:3000',
          pageTitle: 'App',
        },
        'view-c': {
          codeTargetId: 'target-c',
          lastUrl: null,
          pageTitle: null,
        },
      },
    );
  });

  it('falls back to an empty state for malformed values', () => {
    assert.deepEqual(sanitizeStoredBrowserViewState(null), {});
    assert.deepEqual(sanitizeStoredBrowserViewState('oops'), {});
  });
});

describe('setRememberedBrowserUrl', () => {
  it('stores a remembered url per browser view without disturbing others', () => {
    const nextState = setRememberedBrowserUrl(
      {
        'view-a': {
          codeTargetId: 'target-a',
          lastUrl: 'http://localhost:3000',
          pageTitle: 'App',
        },
      },
      {
        browserViewId: 'view-b',
        codeTargetId: 'target-b',
        nextUrl: ' https://example.com/dashboard ',
      },
    );

    assert.deepEqual(nextState, {
      'view-a': {
        codeTargetId: 'target-a',
        lastUrl: 'http://localhost:3000',
        pageTitle: 'App',
      },
      'view-b': {
        codeTargetId: 'target-b',
        lastUrl: 'https://example.com/dashboard',
        pageTitle: null,
      },
    });
  });

  it('drops a browser view when its remembered url is cleared and it has no title', () => {
    const nextState = setRememberedBrowserUrl(
      {
        'view-a': {
          codeTargetId: 'target-a',
          lastUrl: 'http://localhost:3000',
          pageTitle: null,
        },
      },
      {
        browserViewId: 'view-a',
        codeTargetId: 'target-a',
        nextUrl: '   ',
      },
    );

    assert.deepEqual(nextState, {});
  });

  it('clears any remembered title when a browser view is reset to blank', () => {
    const nextState = setRememberedBrowserUrl(
      {
        'view-a': {
          codeTargetId: 'target-a',
          lastUrl: 'http://localhost:3000',
          pageTitle: 'App',
        },
      },
      {
        browserViewId: 'view-a',
        codeTargetId: 'target-a',
        nextUrl: null,
      },
    );

    assert.deepEqual(nextState, {});
  });
});

describe('syncBrowserViewSnapshot', () => {
  it('persists the latest url and title for the browser view', () => {
    const nextState = syncBrowserViewSnapshot({}, {
      browserViewId: 'view-a',
      codeTargetId: 'target-a',
      currentUrl: 'http://localhost:3000/login',
      pageTitle: 'Login',
      canGoBack: false,
      canGoForward: false,
      isLoading: false,
      isVisible: true,
      lastLoadError: null,
    });

    assert.deepEqual(nextState, {
      'view-a': {
        codeTargetId: 'target-a',
        lastUrl: 'http://localhost:3000/login',
        pageTitle: 'Login',
      },
    });
  });
});

describe('getRememberedBrowserUrl', () => {
  it('returns an empty string when the browser view has no remembered url', () => {
    assert.equal(getRememberedBrowserUrl({}, 'missing-view'), '');
  });
});

describe('getRememberedBrowserPageTitle', () => {
  it('returns an empty string when the browser view has no remembered title', () => {
    assert.equal(getRememberedBrowserPageTitle({}, 'missing-view'), '');
  });
});

describe('createDefaultBrowserSnapshot', () => {
  it('starts browser views on a blank, idle page', () => {
    assert.deepEqual(createDefaultBrowserSnapshot('view-a', 'target-a'), {
      browserViewId: 'view-a',
      codeTargetId: 'target-a',
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
