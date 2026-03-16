import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCodexInitializeParams } from '@/main-process/codex-app-server';

describe('buildCodexInitializeParams', () => {
  it('opts into Codex experimental api capabilities during initialize', () => {
    assert.deepEqual(buildCodexInitializeParams(), {
      clientInfo: {
        name: 'devland',
        title: 'Devland',
        version: process.env.npm_package_version ?? '0.0.0',
      },
      capabilities: {
        experimentalApi: true,
      },
    });
  });
});
