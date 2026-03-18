import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getBrowserAddressValue,
  shouldRestoreRememberedBrowserUrl,
  shouldShowBrowserViewport,
} from '@/renderer/code-screen/browser/browser-panel-state';

describe('shouldShowBrowserViewport', () => {
  it('keeps the browser viewport mounted when a remembered url exists', () => {
    assert.equal(
      shouldShowBrowserViewport({
        currentUrl: 'about:blank',
        rememberedUrl: 'http://localhost:3000',
      }),
      true,
    );
  });

  it('hides the viewport on a blank target with no remembered url', () => {
    assert.equal(
      shouldShowBrowserViewport({
        currentUrl: 'about:blank',
        rememberedUrl: '',
      }),
      false,
    );
  });
});

describe('shouldRestoreRememberedBrowserUrl', () => {
  it('restores the remembered url only when the target is still blank', () => {
    assert.equal(
      shouldRestoreRememberedBrowserUrl({
        currentUrl: 'about:blank',
        rememberedUrl: 'http://localhost:3000',
      }),
      true,
    );
    assert.equal(
      shouldRestoreRememberedBrowserUrl({
        currentUrl: 'http://localhost:3000/login',
        rememberedUrl: 'http://localhost:3000',
      }),
      false,
    );
  });
});

describe('getBrowserAddressValue', () => {
  it('prefers the live page url over the remembered url', () => {
    assert.equal(
      getBrowserAddressValue({
        currentUrl: 'http://localhost:3000/login',
        rememberedUrl: 'http://localhost:3000',
      }),
      'http://localhost:3000/login',
    );
  });
});
