import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { getDefaultBrowserTabId } from '@/lib/browser-tabs';
import type { BrowserViewSnapshot } from '@/ipc/contracts';

import { BrowserControlBridge } from './browser-control-bridge';

describe('BrowserControlBridge', () => {
  it('serves session-scoped browser status and navigation', async () => {
    const calls: Array<Record<string, string>> = [];
    const bridge = new BrowserControlBridge({
      getActiveBrowserViewId: (codeTargetId: string) =>
        codeTargetId === 'target-1' ? 'active-tab-1' : null,
      getSnapshot: async (input: {
        browserViewId: string;
        codeTargetId: string;
      }): Promise<BrowserViewSnapshot> => {
        calls.push({
          method: 'status',
          browserViewId: input.browserViewId,
          codeTargetId: input.codeTargetId,
        });

        return {
          browserViewId: input.browserViewId,
          codeTargetId: input.codeTargetId,
          currentUrl: 'about:blank',
          pageTitle: '',
          canGoBack: false,
          canGoForward: false,
          isLoading: false,
          isVisible: false,
          lastLoadError: null,
        };
      },
      navigate: async (input: {
        browserViewId: string;
        codeTargetId: string;
        url: string;
      }): Promise<BrowserViewSnapshot> => {
        calls.push({
          method: 'navigate',
          browserViewId: input.browserViewId,
          codeTargetId: input.codeTargetId,
          url: input.url,
        });

        return {
          browserViewId: input.browserViewId,
          codeTargetId: input.codeTargetId,
          currentUrl: input.url,
          pageTitle: '',
          canGoBack: false,
          canGoForward: false,
          isLoading: false,
          isVisible: false,
          lastLoadError: null,
        };
      },
    } as never);
    const helperRootDir = await mkdtemp(path.join(tmpdir(), 'devland-browser-bridge-'));

    try {
      await bridge.start(helperRootDir);
      const access = bridge.issueSessionAccess({
        sessionId: 'session-1',
        codeTargetId: 'target-1',
      });

      const statusResponse = await fetch(`${access.baseUrl}/status`, {
        headers: { authorization: `Bearer ${access.token}` },
      });
      assert.equal(statusResponse.status, 200);
      assert.deepEqual(await statusResponse.json(), {
        browserViewId: 'active-tab-1',
        codeTargetId: 'target-1',
        currentUrl: 'about:blank',
        pageTitle: '',
        canGoBack: false,
        canGoForward: false,
        isLoading: false,
        isVisible: false,
        lastLoadError: null,
      });

      const navigateResponse = await fetch(`${access.baseUrl}/navigate`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.token}`,
          'content-type': 'text/plain; charset=utf-8',
        },
        body: 'http://localhost:3000',
      });
      assert.equal(navigateResponse.status, 200);
      assert.equal((await navigateResponse.json()).currentUrl, 'http://localhost:3000');

      assert.deepEqual(calls, [
        {
          method: 'status',
          browserViewId: 'active-tab-1',
          codeTargetId: 'target-1',
        },
        {
          method: 'navigate',
          browserViewId: 'active-tab-1',
          codeTargetId: 'target-1',
          url: 'http://localhost:3000',
        },
      ]);
    } finally {
      bridge.dispose();
      await rm(helperRootDir, { recursive: true, force: true });
    }
  });

  it('rejects unauthorized requests', async () => {
    const bridge = new BrowserControlBridge({
      getActiveBrowserViewId: () => null,
      getSnapshot: async () => {
        throw new Error('should not be reached');
      },
      navigate: async () => {
        throw new Error('should not be reached');
      },
    } as never);
    const helperRootDir = await mkdtemp(path.join(tmpdir(), 'devland-browser-bridge-'));

    try {
      await bridge.start(helperRootDir);

      const response = await fetch('http://127.0.0.1:' + new URL(bridge.issueSessionAccess({
        sessionId: 'session-1',
        codeTargetId: 'target-1',
      }).baseUrl).port + '/status');
      assert.equal(response.status, 401);
    } finally {
      bridge.dispose();
      await rm(helperRootDir, { recursive: true, force: true });
    }
  });

  it('falls back to the default tab when no active browser tab is registered', async () => {
    const calls: Array<Record<string, string>> = [];
    const bridge = new BrowserControlBridge({
      getActiveBrowserViewId: () => null,
      getSnapshot: async (input: {
        browserViewId: string;
        codeTargetId: string;
      }): Promise<BrowserViewSnapshot> => {
        calls.push({
          method: 'status',
          browserViewId: input.browserViewId,
          codeTargetId: input.codeTargetId,
        });

        return {
          browserViewId: input.browserViewId,
          codeTargetId: input.codeTargetId,
          currentUrl: 'about:blank',
          pageTitle: '',
          canGoBack: false,
          canGoForward: false,
          isLoading: false,
          isVisible: false,
          lastLoadError: null,
        };
      },
      navigate: async (input: {
        browserViewId: string;
        codeTargetId: string;
        url: string;
      }): Promise<BrowserViewSnapshot> => {
        calls.push({
          method: 'navigate',
          browserViewId: input.browserViewId,
          codeTargetId: input.codeTargetId,
          url: input.url,
        });

        return {
          browserViewId: input.browserViewId,
          codeTargetId: input.codeTargetId,
          currentUrl: input.url,
          pageTitle: '',
          canGoBack: false,
          canGoForward: false,
          isLoading: false,
          isVisible: false,
          lastLoadError: null,
        };
      },
    } as never);
    const helperRootDir = await mkdtemp(path.join(tmpdir(), 'devland-browser-bridge-'));

    try {
      await bridge.start(helperRootDir);
      const access = bridge.issueSessionAccess({
        sessionId: 'session-1',
        codeTargetId: 'target-1',
      });

      await fetch(`${access.baseUrl}/status`, {
        headers: { authorization: `Bearer ${access.token}` },
      });
      await fetch(`${access.baseUrl}/navigate`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.token}`,
          'content-type': 'text/plain; charset=utf-8',
        },
        body: 'http://localhost:3000',
      });

      assert.deepEqual(calls, [
        {
          method: 'status',
          browserViewId: getDefaultBrowserTabId('target-1'),
          codeTargetId: 'target-1',
        },
        {
          method: 'navigate',
          browserViewId: getDefaultBrowserTabId('target-1'),
          codeTargetId: 'target-1',
          url: 'http://localhost:3000',
        },
      ]);
    } finally {
      bridge.dispose();
      await rm(helperRootDir, { recursive: true, force: true });
    }
  });
});
