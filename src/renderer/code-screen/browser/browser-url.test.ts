import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeBrowserUrlInput } from '@/renderer/code-screen/browser/browser-url';

describe('normalizeBrowserUrlInput', () => {
  it('normalizes hostnames without a scheme', () => {
    assert.equal(
      normalizeBrowserUrlInput('example.com'),
      'https://example.com/',
    );
    assert.equal(
      normalizeBrowserUrlInput('localhost:3000'),
      'http://localhost:3000/',
    );
    assert.equal(
      normalizeBrowserUrlInput('my-app.local/dashboard'),
      'http://my-app.local/dashboard',
    );
  });

  it('preserves valid explicit urls', () => {
    assert.equal(
      normalizeBrowserUrlInput('https://example.com/path?q=1'),
      'https://example.com/path?q=1',
    );
    assert.equal(normalizeBrowserUrlInput('about:blank'), 'about:blank');
  });

  it('returns null for invalid values', () => {
    assert.equal(normalizeBrowserUrlInput(''), null);
    assert.equal(normalizeBrowserUrlInput('not a valid host name'), null);
  });
});
