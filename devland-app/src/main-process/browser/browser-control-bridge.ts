import { randomBytes } from 'node:crypto';
import { mkdir, chmod, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';

import { getDefaultBrowserTabId } from '@/lib/browser-tabs';
import type { BrowserViewManager } from '@/main-process/browser/browser-view-manager';

type SessionBrowserAccess = {
  sessionId: string;
  codeTargetId: string;
  browserViewId: string;
  token: string;
};

export type BrowserControlSessionAccess = {
  baseUrl: string;
  token: string;
  helperPath: string;
};

const AUTHORIZATION_PREFIX = 'Bearer ';
const MAX_NAVIGATION_URL_LENGTH = 4096;

export class BrowserControlAuthorizationError extends Error {}

const readRequestBody = async (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;

      if (body.length > MAX_NAVIGATION_URL_LENGTH) {
        reject(new Error('Request body is too large.'));
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void => {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
};

const buildHelperScript = (): string => `#!/bin/sh
set -eu

if [ -z "\${DEVLAND_BROWSER_CONTROL_URL:-}" ] || [ -z "\${DEVLAND_BROWSER_CONTROL_TOKEN:-}" ]; then
  echo "Devland browser control is not configured for this Codex session." >&2
  exit 1
fi

if [ $# -lt 1 ]; then
  echo "Usage: devland-browser <status|navigate> [url]" >&2
  exit 64
fi

command="$1"
shift

case "$command" in
  status)
    exec curl -fsS \\
      -H "Authorization: Bearer $DEVLAND_BROWSER_CONTROL_TOKEN" \\
      "$DEVLAND_BROWSER_CONTROL_URL/status"
    ;;
  navigate)
    if [ $# -lt 1 ]; then
      echo "Usage: devland-browser navigate <url>" >&2
      exit 64
    fi

    exec curl -fsS \\
      -X POST \\
      -H "Authorization: Bearer $DEVLAND_BROWSER_CONTROL_TOKEN" \\
      -H "Content-Type: text/plain; charset=utf-8" \\
      --data-binary "$1" \\
      "$DEVLAND_BROWSER_CONTROL_URL/navigate"
    ;;
  *)
    echo "Unsupported command: $command" >&2
    exit 64
    ;;
esac
`;

export class BrowserControlBridge {
  private server = createServer((request, response) => {
    void this.handleRequest(request, response).catch((error) => {
      if (error instanceof BrowserControlAuthorizationError) {
        writeJson(response, 401, { error: error.message });
        return;
      }

      writeJson(response, 500, {
        error: error instanceof Error ? error.message : 'Unexpected bridge error.',
      });
    });
  });

  private baseUrl: string | null = null;

  private helperPath: string | null = null;

  private readonly accessByToken = new Map<string, SessionBrowserAccess>();

  constructor(private readonly browserViewManager: BrowserViewManager) {}

  async start(helperRootDir: string): Promise<void> {
    if (this.baseUrl !== null && this.helperPath !== null) {
      return;
    }

    const helperDir = path.join(helperRootDir, 'bin');
    const helperPath = path.join(helperDir, 'devland-browser');

    await mkdir(helperDir, { recursive: true });
    await writeFile(helperPath, buildHelperScript(), 'utf8');
    await chmod(helperPath, 0o755);

    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        this.server.off('error', reject);
        resolve();
      });
    });

    const address = this.server.address();

    if (!address || typeof address === 'string') {
      throw new Error('Browser control bridge did not expose a local TCP address.');
    }

    this.baseUrl = `http://127.0.0.1:${address.port}`;
    this.helperPath = helperPath;
  }

  issueSessionAccess(input: {
    sessionId: string;
    codeTargetId: string;
  }): BrowserControlSessionAccess {
    if (this.baseUrl === null || this.helperPath === null) {
      throw new Error('Browser control bridge has not been started.');
    }

    this.revokeSessionAccess(input.sessionId);

    const access: SessionBrowserAccess = {
      sessionId: input.sessionId,
      codeTargetId: input.codeTargetId,
      browserViewId:
        this.browserViewManager.getActiveBrowserViewId(input.codeTargetId) ??
        getDefaultBrowserTabId(input.codeTargetId),
      token: randomBytes(24).toString('base64url'),
    };

    this.accessByToken.set(access.token, access);

    return {
      baseUrl: this.baseUrl,
      token: access.token,
      helperPath: this.helperPath,
    };
  }

  revokeSessionAccess(sessionId: string): void {
    for (const [token, access] of this.accessByToken.entries()) {
      if (access.sessionId === sessionId) {
        this.accessByToken.delete(token);
      }
    }
  }

  dispose(): void {
    this.accessByToken.clear();

    if (this.server.listening) {
      this.server.close();
    }

    this.baseUrl = null;
    this.helperPath = null;
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const access = this.requireAuthorizedAccess(request);
    const browserViewId =
      this.browserViewManager.getActiveBrowserViewId(access.codeTargetId) ??
      access.browserViewId;

    if (request.method === 'GET' && request.url === '/status') {
      const snapshot = await this.browserViewManager.getSnapshot({
        browserViewId,
        codeTargetId: access.codeTargetId,
      });

      writeJson(response, 200, snapshot);
      return;
    }

    if (request.method === 'POST' && request.url === '/navigate') {
      const body = await readRequestBody(request);
      const url = body.trim();

      if (url.length === 0) {
        writeJson(response, 400, { error: 'A target URL is required.' });
        return;
      }

      const snapshot = await this.browserViewManager.navigate({
        browserViewId,
        codeTargetId: access.codeTargetId,
        url,
      });

      writeJson(response, 200, snapshot);
      return;
    }

    writeJson(response, 404, { error: 'Unknown browser control endpoint.' });
  }

  private requireAuthorizedAccess(request: IncomingMessage): SessionBrowserAccess {
    const authorizationHeader = request.headers.authorization?.trim() ?? '';

    if (!authorizationHeader.startsWith(AUTHORIZATION_PREFIX)) {
      throw new BrowserControlAuthorizationError(
        'Missing browser control authorization token.',
      );
    }

    const token = authorizationHeader.slice(AUTHORIZATION_PREFIX.length).trim();
    const access = this.accessByToken.get(token);

    if (!access) {
      throw new BrowserControlAuthorizationError(
        'Unknown browser control authorization token.',
      );
    }

    return access;
  }
}
