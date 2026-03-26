import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { getDefaultBrowserTabId } from '@/lib/browser-tabs';
import type { BrowserViewSnapshot } from '@/ipc/contracts';

import { BrowserControlBridge } from './browser-control-bridge';

describe('BrowserControlBridge', () => {
  it('serves session-scoped browser status, inspection, interaction, and screenshots', async () => {
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
      inspect: async (input: {
        browserViewId: string;
        codeTargetId: string;
        selector?: string | null;
      }) => {
        calls.push({
          method: 'inspect',
          browserViewId: input.browserViewId,
          codeTargetId: input.codeTargetId,
          selector: input.selector ?? '',
        });

        return {
          snapshot: {
            browserViewId: input.browserViewId,
            codeTargetId: input.codeTargetId,
            currentUrl: 'about:blank',
            pageTitle: '',
            canGoBack: false,
            canGoForward: false,
            isLoading: false,
            isVisible: false,
            lastLoadError: null,
          },
          readyState: 'complete',
          activeSelector: 'input[name="email"]',
          element: input.selector
            ? {
                selector: input.selector,
                tagName: 'button',
                role: null,
                text: 'Continue',
                value: null,
                placeholder: null,
                name: null,
                type: null,
                ariaLabel: null,
                title: null,
                href: null,
                disabled: false,
                visible: true,
                checked: null,
                rect: { x: 1, y: 2, width: 3, height: 4 },
              }
            : null,
          elements: input.selector
            ? []
            : [
                {
                  selector: 'input[name="email"]',
                  tagName: 'input',
                  role: null,
                  text: '',
                  value: '',
                  placeholder: 'Email',
                  name: 'email',
                  type: 'email',
                  ariaLabel: null,
                  title: null,
                  href: null,
                  disabled: false,
                  visible: true,
                  checked: false,
                  rect: { x: 1, y: 2, width: 3, height: 4 },
                },
              ],
        };
      },
      click: async (input: {
        browserViewId: string;
        codeTargetId: string;
        selector: string;
      }) => {
        calls.push({
          method: 'click',
          browserViewId: input.browserViewId,
          codeTargetId: input.codeTargetId,
          selector: input.selector,
        });

        return {
          snapshot: {
            browserViewId: input.browserViewId,
            codeTargetId: input.codeTargetId,
            currentUrl: 'about:blank',
            pageTitle: '',
            canGoBack: false,
            canGoForward: false,
            isLoading: false,
            isVisible: false,
            lastLoadError: null,
          },
          element: {
            selector: input.selector,
            tagName: 'button',
            role: null,
            text: 'Continue',
            value: null,
            placeholder: null,
            name: null,
            type: null,
            ariaLabel: null,
            title: null,
            href: null,
            disabled: false,
            visible: true,
            checked: null,
            rect: { x: 1, y: 2, width: 3, height: 4 },
          },
        };
      },
      typeIntoElement: async (input: {
        browserViewId: string;
        codeTargetId: string;
        selector: string;
        text: string;
      }) => {
        calls.push({
          method: 'type',
          browserViewId: input.browserViewId,
          codeTargetId: input.codeTargetId,
          selector: input.selector,
          text: input.text,
        });

        return {
          snapshot: {
            browserViewId: input.browserViewId,
            codeTargetId: input.codeTargetId,
            currentUrl: 'about:blank',
            pageTitle: '',
            canGoBack: false,
            canGoForward: false,
            isLoading: false,
            isVisible: false,
            lastLoadError: null,
          },
          element: {
            selector: input.selector,
            tagName: 'input',
            role: null,
            text: '',
            value: input.text,
            placeholder: 'Email',
            name: 'email',
            type: 'email',
            ariaLabel: null,
            title: null,
            href: null,
            disabled: false,
            visible: true,
            checked: false,
            rect: { x: 1, y: 2, width: 3, height: 4 },
          },
        };
      },
      captureScreenshot: async (input: {
        browserViewId: string;
        codeTargetId: string;
      }) => {
        calls.push({
          method: 'screenshot',
          browserViewId: input.browserViewId,
          codeTargetId: input.codeTargetId,
        });

        return {
          snapshot: {
            browserViewId: input.browserViewId,
            codeTargetId: input.codeTargetId,
            currentUrl: 'about:blank',
            pageTitle: 'Smoke page',
            canGoBack: false,
            canGoForward: false,
            isLoading: false,
            isVisible: false,
            lastLoadError: null,
          },
          pngBytes: Buffer.from('not-a-real-png'),
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

      const inspectResponse = await fetch(`${access.baseUrl}/inspect`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.token}`,
          'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
        body: new URLSearchParams({ selector: 'button#continue' }).toString(),
      });
      assert.equal(inspectResponse.status, 200);
      assert.equal((await inspectResponse.json()).element.selector, 'button#continue');

      const typeResponse = await fetch(`${access.baseUrl}/type`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.token}`,
          'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
        body: new URLSearchParams({
          selector: 'input[name="email"]',
          text: 'qa@example.com',
        }).toString(),
      });
      assert.equal(typeResponse.status, 200);
      assert.equal((await typeResponse.json()).element.value, 'qa@example.com');

      const clickResponse = await fetch(`${access.baseUrl}/click`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.token}`,
          'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
        body: new URLSearchParams({ selector: 'button#continue' }).toString(),
      });
      assert.equal(clickResponse.status, 200);
      assert.equal((await clickResponse.json()).element.selector, 'button#continue');

      const screenshotResponse = await fetch(`${access.baseUrl}/screenshot`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.token}`,
          'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
        body: new URLSearchParams({ name: 'browser-smoke.png' }).toString(),
      });
      assert.equal(screenshotResponse.status, 200);
      const screenshotPayload = (await screenshotResponse.json()) as {
        name: string;
        previewUrl: string;
        path: string;
        markdown: string;
      };
      assert.equal(screenshotPayload.name, 'browser-smoke.png');
      assert.match(
        screenshotPayload.markdown,
        /^!\[browser-smoke\.png\]\(devland-codex-attachment:\/\/asset\//,
      );
      assert.match(screenshotPayload.path, /\.png$/);
      assert.equal((await readFile(screenshotPayload.path)).toString('utf8'), 'not-a-real-png');

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
        {
          method: 'inspect',
          browserViewId: 'active-tab-1',
          codeTargetId: 'target-1',
          selector: 'button#continue',
        },
        {
          method: 'type',
          browserViewId: 'active-tab-1',
          codeTargetId: 'target-1',
          selector: 'input[name="email"]',
          text: 'qa@example.com',
        },
        {
          method: 'click',
          browserViewId: 'active-tab-1',
          codeTargetId: 'target-1',
          selector: 'button#continue',
        },
        {
          method: 'screenshot',
          browserViewId: 'active-tab-1',
          codeTargetId: 'target-1',
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
      inspect: async () => {
        throw new Error('should not be reached');
      },
      click: async () => {
        throw new Error('should not be reached');
      },
      typeIntoElement: async () => {
        throw new Error('should not be reached');
      },
      captureScreenshot: async () => {
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
      inspect: async (input: {
        browserViewId: string;
        codeTargetId: string;
        selector?: string | null;
      }) => {
        calls.push({
          method: 'inspect',
          browserViewId: input.browserViewId,
          codeTargetId: input.codeTargetId,
          selector: input.selector ?? '',
        });

        return {
          snapshot: {
            browserViewId: input.browserViewId,
            codeTargetId: input.codeTargetId,
            currentUrl: 'about:blank',
            pageTitle: '',
            canGoBack: false,
            canGoForward: false,
            isLoading: false,
            isVisible: false,
            lastLoadError: null,
          },
          readyState: 'complete',
          activeSelector: null,
          element: null,
          elements: [],
        };
      },
      click: async (input: {
        browserViewId: string;
        codeTargetId: string;
        selector: string;
      }) => {
        calls.push({
          method: 'click',
          browserViewId: input.browserViewId,
          codeTargetId: input.codeTargetId,
          selector: input.selector,
        });

        return {
          snapshot: {
            browserViewId: input.browserViewId,
            codeTargetId: input.codeTargetId,
            currentUrl: 'about:blank',
            pageTitle: '',
            canGoBack: false,
            canGoForward: false,
            isLoading: false,
            isVisible: false,
            lastLoadError: null,
          },
          element: {
            selector: input.selector,
            tagName: 'button',
            role: null,
            text: 'Continue',
            value: null,
            placeholder: null,
            name: null,
            type: null,
            ariaLabel: null,
            title: null,
            href: null,
            disabled: false,
            visible: true,
            checked: null,
            rect: { x: 1, y: 2, width: 3, height: 4 },
          },
        };
      },
      typeIntoElement: async (input: {
        browserViewId: string;
        codeTargetId: string;
        selector: string;
        text: string;
      }) => {
        calls.push({
          method: 'type',
          browserViewId: input.browserViewId,
          codeTargetId: input.codeTargetId,
          selector: input.selector,
          text: input.text,
        });

        return {
          snapshot: {
            browserViewId: input.browserViewId,
            codeTargetId: input.codeTargetId,
            currentUrl: 'about:blank',
            pageTitle: '',
            canGoBack: false,
            canGoForward: false,
            isLoading: false,
            isVisible: false,
            lastLoadError: null,
          },
          element: {
            selector: input.selector,
            tagName: 'input',
            role: null,
            text: '',
            value: input.text,
            placeholder: 'Email',
            name: 'email',
            type: 'email',
            ariaLabel: null,
            title: null,
            href: null,
            disabled: false,
            visible: true,
            checked: false,
            rect: { x: 1, y: 2, width: 3, height: 4 },
          },
        };
      },
      captureScreenshot: async (input: {
        browserViewId: string;
        codeTargetId: string;
      }) => {
        calls.push({
          method: 'screenshot',
          browserViewId: input.browserViewId,
          codeTargetId: input.codeTargetId,
        });

        return {
          snapshot: {
            browserViewId: input.browserViewId,
            codeTargetId: input.codeTargetId,
            currentUrl: 'about:blank',
            pageTitle: 'Fallback page',
            canGoBack: false,
            canGoForward: false,
            isLoading: false,
            isVisible: false,
            lastLoadError: null,
          },
          pngBytes: Buffer.from('fallback'),
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
      await fetch(`${access.baseUrl}/inspect`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.token}`,
          'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
        body: new URLSearchParams({ selector: 'button#continue' }).toString(),
      });
      await fetch(`${access.baseUrl}/navigate`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.token}`,
          'content-type': 'text/plain; charset=utf-8',
        },
        body: 'http://localhost:3000',
      });
      await fetch(`${access.baseUrl}/type`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.token}`,
          'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
        body: new URLSearchParams({
          selector: 'input[name="email"]',
          text: 'qa@example.com',
        }).toString(),
      });
      await fetch(`${access.baseUrl}/click`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.token}`,
          'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
        body: new URLSearchParams({ selector: 'button#continue' }).toString(),
      });
      await fetch(`${access.baseUrl}/screenshot`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.token}`,
          'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
        body: new URLSearchParams({ name: 'fallback.png' }).toString(),
      });

      assert.deepEqual(calls, [
        {
          method: 'status',
          browserViewId: getDefaultBrowserTabId('target-1'),
          codeTargetId: 'target-1',
        },
        {
          method: 'inspect',
          browserViewId: getDefaultBrowserTabId('target-1'),
          codeTargetId: 'target-1',
          selector: 'button#continue',
        },
        {
          method: 'navigate',
          browserViewId: getDefaultBrowserTabId('target-1'),
          codeTargetId: 'target-1',
          url: 'http://localhost:3000',
        },
        {
          method: 'type',
          browserViewId: getDefaultBrowserTabId('target-1'),
          codeTargetId: 'target-1',
          selector: 'input[name="email"]',
          text: 'qa@example.com',
        },
        {
          method: 'click',
          browserViewId: getDefaultBrowserTabId('target-1'),
          codeTargetId: 'target-1',
          selector: 'button#continue',
        },
        {
          method: 'screenshot',
          browserViewId: getDefaultBrowserTabId('target-1'),
          codeTargetId: 'target-1',
        },
      ]);
    } finally {
      bridge.dispose();
      await rm(helperRootDir, { recursive: true, force: true });
    }
  });
});
