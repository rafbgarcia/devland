import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getProjectTabIdFromRouteMatch,
  getProjectTabRoute,
  toProjectExtensionTabId,
} from '@/renderer/shared/lib/projects';

describe('getProjectTabRoute', () => {
  it('builds built-in routes', () => {
    assert.deepEqual(
      getProjectTabRoute('devland', 'pull-requests'),
      {
        to: '/projects/$repoId/pull-requests',
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

describe('getProjectTabIdFromRouteMatch', () => {
  it('parses built-in tabs from matched routes', () => {
    assert.equal(
      getProjectTabIdFromRouteMatch({
        fullPath: '/projects/$repoId/pull-requests',
      }),
      'pull-requests',
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
