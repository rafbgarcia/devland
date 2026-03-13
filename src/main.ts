import {
  app,
  BrowserWindow,
  session,
  shell,
  type Input,
} from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import {
  APP_SHORTCUT_COMMAND_CHANNEL,
  type AppShortcutCommand,
} from '@/ipc/contracts';
import { registerAppIpcHandlers } from './main-process/ipc';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const isDevelopment = MAIN_WINDOW_VITE_DEV_SERVER_URL !== undefined;
const devServerOrigin = MAIN_WINDOW_VITE_DEV_SERVER_URL
  ? new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin
  : null;
const developmentContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk='",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.githubusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self' ${devServerOrigin} ${
    devServerOrigin?.replace(/^http/, 'ws') ?? ''
  }`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

let mainWindow: BrowserWindow | null = null;

const isAppUrl = (targetUrl: string): boolean => {
  if (targetUrl.startsWith('file://')) {
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

const getAppShortcutCommand = (input: Input): AppShortcutCommand | null => {
  if (
    input.type !== 'keyDown' ||
    input.isComposing ||
    !input.meta ||
    input.alt ||
    input.control
  ) {
    return null;
  }

  if (input.shift && input.code === 'BracketLeft') {
    return {
      type: 'cycle-project-tab',
      direction: 'previous',
    };
  }

  if (input.shift && input.code === 'BracketRight') {
    return {
      type: 'cycle-project-tab',
      direction: 'next',
    };
  }

  if (input.shift || !input.code.startsWith('Digit')) {
    return null;
  }

  const shortcutIndex = Number(input.code.slice('Digit'.length)) - 1;

  if (!Number.isInteger(shortcutIndex) || shortcutIndex < 0 || shortcutIndex > 8) {
    return null;
  }

  return {
    type: 'activate-project-tab-by-shortcut-slot',
    slot: shortcutIndex + 1,
  };
};

const registerAppShortcutForwarding = (window: BrowserWindow): void => {
  window.webContents.on('before-input-event', (event, input) => {
    const command = getAppShortcutCommand(input);

    if (command === null) {
      return;
    }

    event.preventDefault();
    window.webContents.send(APP_SHORTCUT_COMMAND_CHANNEL, command);
  });
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
  registerAppShortcutForwarding(mainWindow);

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

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on('second-instance', () => {
  focusMainWindow();
});

app.whenReady().then(async () => {
  app.setAppUserModelId(app.name);
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
