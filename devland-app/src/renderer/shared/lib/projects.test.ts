import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getProjectTabIdFromRouteMatch,
  getProjectTabRoute,
  resolveProjectTabId,
  toProjectExtensionTabId,
} from '@/renderer/shared/lib/projects';

describe('getProjectTabRoute', () => {
  it('builds built-in routes', () => {
    assert.deepEqual(
      getProjectTabRoute('devland', 'issues'),
      {
        to: '/projects/$repoId/issues',
        params: { repoId: 'devland' },
      },
    );
  });

  it('builds extension routes', () => {
    assert.deepEqual(
      getProjectTabRoute('devland', 'extension:gh-prs'),
      {
        to: '/projects/$repoId/extensions/$extensionId',
        params: {
          repoId: 'devland',
          extensionId: 'gh-prs',
        },
      },
    );
  });
});

describe('resolveProjectTabId', () => {
  it('maps the legacy pull requests tab id to the gh-prs extension tab id', () => {
    assert.equal(
      resolveProjectTabId('pull-requests'),
      toProjectExtensionTabId('gh-prs'),
    );
  });
});

describe('getProjectTabIdFromRouteMatch', () => {
  it('parses built-in tabs from matched routes', () => {
    assert.equal(
      getProjectTabIdFromRouteMatch({
        fullPath: '/projects/$repoId/issues',
      }),
      'issues',
    );
  });

  it('parses extension tabs from matched routes', () => {
    assert.equal(
      getProjectTabIdFromRouteMatch({
        fullPath: '/projects/$repoId/extensions/$extensionId',
        extensionId: 'gh-prs',
      }),
      toProjectExtensionTabId('gh-prs'),
    );
  });
});
