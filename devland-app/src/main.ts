import {
  app,
  BrowserWindow,
  net,
  nativeImage,
  protocol,
  session,
  shell,
} from 'electron';
import { access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import {
  APP_SHORTCUT_COMMAND_CHANNEL,
} from '@/ipc/contracts';
import { registerAppShortcutForwarding } from './main-process/app-shortcuts';
import {
  DEVLAND_EXTENSION_PROTOCOL,
  resolveExtensionAssetPath,
} from './main-process/extensions/protocol';
import {
  DEVLAND_CODEX_ATTACHMENT_PROTOCOL,
  resolveCodexAttachmentPath,
} from './main-process/codex-attachments';
import { registerAppIpcHandlers } from './main-process/ipc';
import { targetBrowserManager } from './main-process/browser/target-browser-manager';
import { terminalSessionManager } from './main-process/terminal-session-manager';
import { getDevUserDataDir } from './dev/dev-instance';

protocol.registerSchemesAsPrivileged([
  {
    scheme: DEVLAND_EXTENSION_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
  {
    scheme: DEVLAND_CODEX_ATTACHMENT_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const isDevelopment = MAIN_WINDOW_VITE_DEV_SERVER_URL !== undefined;
const APP_DISPLAY_NAME = isDevelopment ? 'Devland:dev' : 'Devland';
const allowMultiInstance = isDevelopment;
const devServerOrigin = MAIN_WINDOW_VITE_DEV_SERVER_URL
  ? new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin
  : null;
const developmentContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk='",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: https://*.githubusercontent.com ${DEVLAND_CODEX_ATTACHMENT_PROTOCOL}:`,
  "font-src 'self' data:",
  `frame-src 'self' ${DEVLAND_EXTENSION_PROTOCOL}: http://127.0.0.1:* http://localhost:* https:`,
  `connect-src 'self' ${devServerOrigin} ${devServerOrigin?.replace(/^http/, 'ws') ?? ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

let mainWindow: BrowserWindow | null = null;
const appIconPath = path.join(app.getAppPath(), 'assets', 'icons', 'devland.png');
const userDataDir = isDevelopment
  ? getDevUserDataDir(process.cwd())
  : process.env.DEVLAND_USER_DATA_DIR?.trim() || process.env.DEVLAND_TEST_USER_DATA_DIR?.trim();

app.setName(APP_DISPLAY_NAME);

if (userDataDir) {
  app.setPath('userData', userDataDir);
}

const isAppUrl = (targetUrl: string): boolean => {
  if (targetUrl.startsWith('file://')) {
    return true;
  }

  if (targetUrl.startsWith(`${DEVLAND_EXTENSION_PROTOCOL}://`)) {
    return true;
  }

  if (targetUrl.startsWith(`${DEVLAND_CODEX_ATTACHMENT_PROTOCOL}://`)) {
    return true;
  }

  if (!devServerOrigin) {
    return false;
  }

  return new URL(targetUrl).origin === devServerOrigin;
};

const openExternalUrl = (targetUrl: string): void => {
  try {
    const parsedUrl = new URL(targetUrl);

    if (parsedUrl.protocol !== 'https:') {
      return;
    }

    void shell.openExternal(targetUrl);
  } catch {
    return;
  }
};

const configureSessionSecurity = (): void => {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );

  if (!isDevelopment || !devServerOrigin) {
    return;
  }

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders ?? {};

    if (!details.url.startsWith(devServerOrigin)) {
      callback({ responseHeaders });
      return;
    }

    callback({
      responseHeaders: {
        ...responseHeaders,
        'Content-Security-Policy': [developmentContentSecurityPolicy],
      },
    });
  });
};

const registerExtensionProtocol = (): void => {
  protocol.handle(DEVLAND_EXTENSION_PROTOCOL, async (request) => {
    const assetPath = resolveExtensionAssetPath(request.url);

    if (assetPath === null) {
      return new Response('Extension asset not found.', { status: 404 });
    }

    try {
      await access(assetPath);

      return net.fetch(pathToFileURL(assetPath).toString());
    } catch {
      return new Response('Extension asset not found.', { status: 404 });
    }
  });
};

const registerCodexAttachmentProtocol = (): void => {
  protocol.handle(DEVLAND_CODEX_ATTACHMENT_PROTOCOL, async (request) => {
    const assetPath = resolveCodexAttachmentPath(request.url);

    if (assetPath === null) {
      return new Response('Attachment not found.', { status: 404 });
    }

    try {
      await access(assetPath);

      return net.fetch(pathToFileURL(assetPath).toString());
    } catch {
      return new Response('Attachment not found.', { status: 404 });
    }
  });
};

const createWindow = async (): Promise<BrowserWindow> => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#e9e1d3',
    ...(process.platform === 'linux' ? { icon: appIconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: isDevelopment,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAppUrl(url)) {
      openExternalUrl(url);
    }

    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (isAppUrl(navigationUrl)) {
      return;
    }

    event.preventDefault();
    openExternalUrl(navigationUrl);
  });
  registerAppShortcutForwarding(
    mainWindow.webContents,
    (command) => mainWindow?.webContents.send(APP_SHORTCUT_COMMAND_CHANNEL, command),
  );

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return mainWindow;
};

const focusMainWindow = (): void => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
};

const configureMacDockIcon = (): void => {
  if (process.platform !== 'darwin' || app.dock === undefined) {
    return;
  }

  const dockIcon = nativeImage.createFromPath(appIconPath);

  if (dockIcon.isEmpty()) {
    return;
  }

  app.dock.setIcon(dockIcon);
};

if (!allowMultiInstance && !app.requestSingleInstanceLock()) {
  app.quit();
}

if (!allowMultiInstance) {
  app.on('second-instance', () => {
    focusMainWindow();
  });
}

app.whenReady().then(async () => {
  app.setAppUserModelId(app.name);
  configureMacDockIcon();
  registerExtensionProtocol();
  registerCodexAttachmentProtocol();
  configureSessionSecurity();
  registerAppIpcHandlers(() => mainWindow);
  await createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  } else {
    focusMainWindow();
  }
});

app.on('before-quit', () => {
  targetBrowserManager.dispose();
  terminalSessionManager.dispose();
});
