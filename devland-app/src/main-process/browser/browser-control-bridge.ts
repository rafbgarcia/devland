import { randomBytes } from 'node:crypto';
import { mkdir, chmod, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';

import { getDefaultBrowserTabId } from '@/lib/browser-tabs';
import {
  persistCodexImageBufferAttachments,
  resolveCodexAttachmentPath,
} from '@/main-process/codex-attachments';
import type { BrowserViewManager } from '@/main-process/browser/browser-view-manager';

type SessionBrowserAccess = {
  sessionId: string;
  codeTargetId: string;
  browserViewId: string;
  token: string;
  screenshotLogPath: string;
};

export type BrowserControlSessionAccess = {
  baseUrl: string;
  token: string;
  helperPath: string;
  screenshotLogPath: string;
};

const AUTHORIZATION_PREFIX = 'Bearer ';
const MAX_REQUEST_BODY_LENGTH = 64 * 1024;
const SCREENSHOT_MIME_TYPE = 'image/png';

export class BrowserControlAuthorizationError extends Error {}

const readRequestBody = async (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;

      if (body.length > MAX_REQUEST_BODY_LENGTH) {
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

const readFormBody = async (request: IncomingMessage): Promise<URLSearchParams> =>
  new URLSearchParams(await readRequestBody(request));

const buildHelperScript = (): string => `#!/bin/sh
set -eu

if [ -z "\${DEVLAND_BROWSER_CONTROL_URL:-}" ] || [ -z "\${DEVLAND_BROWSER_CONTROL_TOKEN:-}" ]; then
  echo "Devland browser control is not configured for this Codex session." >&2
  exit 1
fi

if [ $# -lt 1 ]; then
  echo "Usage: devland-browser <status|navigate|inspect|click|type|screenshot> [...]" >&2
  exit 64
fi

command="$1"
shift

request_json() {
  method="$1"
  endpoint="$2"
  shift 2

  curl -fsS \\
    -X "$method" \\
    -H "Authorization: Bearer $DEVLAND_BROWSER_CONTROL_TOKEN" \\
    "$@" \\
    "$DEVLAND_BROWSER_CONTROL_URL$endpoint"
}

case "$command" in
  status)
    request_json GET /status
    ;;
  navigate)
    if [ $# -lt 1 ]; then
      echo "Usage: devland-browser navigate <url>" >&2
      exit 64
    fi

    request_json POST /navigate \\
      -H "Content-Type: text/plain; charset=utf-8" \\
      --data-binary "$1"
    ;;
  inspect)
    if [ $# -gt 0 ]; then
      request_json POST /inspect \\
        -H "Content-Type: application/x-www-form-urlencoded; charset=utf-8" \\
        --data-urlencode "selector=$1"
    else
      request_json POST /inspect
    fi
    ;;
  click)
    if [ $# -lt 1 ]; then
      echo "Usage: devland-browser click <selector>" >&2
      exit 64
    fi

    request_json POST /click \\
      -H "Content-Type: application/x-www-form-urlencoded; charset=utf-8" \\
      --data-urlencode "selector=$1"
    ;;
  type)
    if [ $# -lt 2 ]; then
      echo "Usage: devland-browser type <selector> <text>" >&2
      exit 64
    fi

    request_json POST /type \\
      -H "Content-Type: application/x-www-form-urlencoded; charset=utf-8" \\
      --data-urlencode "selector=$1" \\
      --data-urlencode "text=$2"
    ;;
  screenshot)
    if [ $# -gt 0 ]; then
      response="$(request_json POST /screenshot \\
        -H "Content-Type: application/x-www-form-urlencoded; charset=utf-8" \\
        --data-urlencode "name=$1")"
    else
      response="$(request_json POST /screenshot)"
    fi

    if [ -n "\${DEVLAND_BROWSER_SCREENSHOT_LOG:-}" ]; then
      mkdir -p "$(dirname "$DEVLAND_BROWSER_SCREENSHOT_LOG")"
      printf '%s\n' "$response" >> "$DEVLAND_BROWSER_SCREENSHOT_LOG"
    fi

    printf '%s\n' "$response"
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

  private helperRootDir: string | null = null;

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
    this.helperRootDir = helperRootDir;
  }

  issueSessionAccess(input: {
    sessionId: string;
    codeTargetId: string;
  }): BrowserControlSessionAccess {
    if (this.baseUrl === null || this.helperPath === null || this.helperRootDir === null) {
      throw new Error('Browser control bridge has not been started.');
    }

    this.revokeSessionAccess(input.sessionId);

    const screenshotLogPath = path.join(
      this.helperRootDir,
      'screenshots',
      `${input.sessionId}.jsonl`,
    );

    const access: SessionBrowserAccess = {
      sessionId: input.sessionId,
      codeTargetId: input.codeTargetId,
      browserViewId:
        this.browserViewManager.getActiveBrowserViewId(input.codeTargetId) ??
        getDefaultBrowserTabId(input.codeTargetId),
      token: randomBytes(24).toString('base64url'),
      screenshotLogPath,
    };

    this.accessByToken.set(access.token, access);

    void mkdir(path.dirname(screenshotLogPath), { recursive: true }).then(() =>
      writeFile(screenshotLogPath, '', 'utf8'),
    );

    return {
      baseUrl: this.baseUrl,
      token: access.token,
      helperPath: this.helperPath,
      screenshotLogPath,
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
    this.helperRootDir = null;
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

    if (request.method === 'POST' && request.url === '/inspect') {
      const formData = await readFormBody(request);
      const snapshot = await this.browserViewManager.inspect({
        browserViewId,
        codeTargetId: access.codeTargetId,
        selector: formData.get('selector'),
      });

      writeJson(response, 200, snapshot);
      return;
    }

    if (request.method === 'POST' && request.url === '/click') {
      const formData = await readFormBody(request);
      const selector = formData.get('selector')?.trim() ?? '';

      if (selector.length === 0) {
        writeJson(response, 400, { error: 'A selector is required.' });
        return;
      }

      const snapshot = await this.browserViewManager.click({
        browserViewId,
        codeTargetId: access.codeTargetId,
        selector,
      });

      writeJson(response, 200, snapshot);
      return;
    }

    if (request.method === 'POST' && request.url === '/type') {
      const formData = await readFormBody(request);
      const selector = formData.get('selector')?.trim() ?? '';
      const text = formData.get('text') ?? '';

      if (selector.length === 0) {
        writeJson(response, 400, { error: 'A selector is required.' });
        return;
      }

      const snapshot = await this.browserViewManager.typeIntoElement({
        browserViewId,
        codeTargetId: access.codeTargetId,
        selector,
        text,
      });

      writeJson(response, 200, snapshot);
      return;
    }

    if (request.method === 'POST' && request.url === '/screenshot') {
      const formData = await readFormBody(request);
      const requestedName = formData.get('name')?.trim() || null;
      const screenshot = await this.browserViewManager.captureScreenshot({
        browserViewId,
        codeTargetId: access.codeTargetId,
      });

      if (screenshot.pngBytes.byteLength < 1) {
        throw new Error('Browser screenshot capture returned an empty PNG buffer.');
      }

      const pageTitle = screenshot.snapshot.pageTitle.trim();
      const attachmentName =
        requestedName ??
        (pageTitle.length > 0 ? `${pageTitle} screenshot.png` : 'browser-screenshot.png');
      const [attachment] = await persistCodexImageBufferAttachments([
        {
          type: 'image',
          name: attachmentName,
          mimeType: SCREENSHOT_MIME_TYPE,
          sizeBytes: screenshot.pngBytes.byteLength,
          bytes: screenshot.pngBytes,
        },
      ]);

      if (!attachment?.previewUrl) {
        throw new Error('Browser screenshot did not produce a preview URL.');
      }

      const absolutePath = resolveCodexAttachmentPath(attachment.previewUrl);

      if (absolutePath === null) {
        throw new Error('Browser screenshot path could not be resolved.');
      }

      writeJson(response, 200, {
        ...attachment,
        path: absolutePath,
        markdown: `![${attachment.name}](${attachment.previewUrl})`,
        snapshot: screenshot.snapshot,
      });
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
