import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createBrowserPartition,
  isAllowedBrowserUrl,
  isLoopbackHost,
  isSafeExternalUrl,
} from '@/main-process/browser/browser-session-utils';

describe('createBrowserPartition', () => {
  it('returns a stable persistent partition per target id', () => {
    assert.equal(
      createBrowserPartition('repo-1:root'),
      createBrowserPartition('repo-1:root'),
    );
    assert.notEqual(
      createBrowserPartition('repo-1:root'),
      createBrowserPartition('session-2'),
    );
    assert.match(createBrowserPartition('repo-1:root'), /^persist:devland-browser:/);
  });
});

describe('isLoopbackHost', () => {
  it('allows local development hostnames', () => {
    assert.equal(isLoopbackHost('localhost'), true);
    assert.equal(isLoopbackHost('127.0.0.1'), true);
    assert.equal(isLoopbackHost('0.0.0.0'), true);
    assert.equal(isLoopbackHost('[::1]'), true);
    assert.equal(isLoopbackHost('www.dexorview.localhost'), true);
    assert.equal(isLoopbackHost('my-app.local'), true);
  });

  it('rejects non-local hosts', () => {
    assert.equal(isLoopbackHost('example.com'), false);
    assert.equal(isLoopbackHost('192.168.0.8'), false);
  });
});

describe('isAllowedBrowserUrl', () => {
  it('allows blank pages, https, and loopback http', () => {
    assert.equal(isAllowedBrowserUrl('about:blank'), true);
    assert.equal(isAllowedBrowserUrl('https://example.com'), true);
    assert.equal(isAllowedBrowserUrl('http://localhost:3000'), true);
    assert.equal(isAllowedBrowserUrl('http://www.dexorview.localhost:3000'), true);
    assert.equal(isAllowedBrowserUrl('http://0.0.0.0:5173'), true);
  });

  it('rejects unsupported navigation targets', () => {
    assert.equal(isAllowedBrowserUrl('http://example.com'), false);
    assert.equal(isAllowedBrowserUrl('file:///tmp/index.html'), false);
    assert.equal(isAllowedBrowserUrl('javascript:alert(1)'), false);
  });
});

describe('isSafeExternalUrl', () => {
  it('limits external opening to safe protocols', () => {
    assert.equal(isSafeExternalUrl('https://example.com'), true);
    assert.equal(isSafeExternalUrl('mailto:test@example.com'), true);
    assert.equal(isSafeExternalUrl('http://localhost:3000'), false);
  });
});
