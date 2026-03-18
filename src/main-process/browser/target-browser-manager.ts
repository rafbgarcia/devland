import { EventEmitter } from 'node:events';

import {
  BrowserWindow,
  WebContentsView,
  session,
  shell,
  type Rectangle,
  type Session,
} from 'electron';

import type {
  BrowserViewBounds,
  BrowserViewEvent,
  BrowserViewSnapshot,
} from '@/ipc/contracts';
import {
  createBrowserPartition,
  isAllowedBrowserUrl,
  isSafeExternalUrl,
} from '@/main-process/browser/browser-session-utils';

type ManagedBrowserTarget = {
  targetId: string;
  partition: string;
  session: Session;
  view: WebContentsView;
  snapshot: BrowserViewSnapshot;
};

const BLANK_PAGE_URL = 'about:blank';
const ERR_ABORTED = -3;

const toRectangle = (bounds: BrowserViewBounds): Rectangle => ({
  x: Math.round(bounds.x),
  y: Math.round(bounds.y),
  width: Math.max(1, Math.round(bounds.width)),
  height: Math.max(1, Math.round(bounds.height)),
});

const createSnapshot = (
  targetId: string,
  current: Partial<BrowserViewSnapshot> = {},
): BrowserViewSnapshot => ({
  targetId,
  currentUrl: current.currentUrl ?? BLANK_PAGE_URL,
  pageTitle: current.pageTitle ?? '',
  canGoBack: current.canGoBack ?? false,
  canGoForward: current.canGoForward ?? false,
  isLoading: current.isLoading ?? false,
  isVisible: current.isVisible ?? false,
  lastLoadError: current.lastLoadError ?? null,
});

const readSnapshot = (target: ManagedBrowserTarget): BrowserViewSnapshot => ({
  ...target.snapshot,
  currentUrl: target.view.webContents.getURL() || BLANK_PAGE_URL,
  pageTitle: target.view.webContents.getTitle(),
  canGoBack: target.view.webContents.canGoBack(),
  canGoForward: target.view.webContents.canGoForward(),
  isLoading: target.view.webContents.isLoadingMainFrame(),
});

const configureBrowserSession = (browserSession: Session): void => {
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    },
  );
};

const maybeOpenExternalUrl = (targetUrl: string): void => {
  if (!isSafeExternalUrl(targetUrl)) {
    return;
  }

  void shell.openExternal(targetUrl);
};

export class TargetBrowserManager extends EventEmitter<{
  event: [BrowserViewEvent];
}> {
  private readonly targets = new Map<string, ManagedBrowserTarget>();

  private getMainWindow: () => BrowserWindow | null = () => null;

  setMainWindowProvider(provider: () => BrowserWindow | null): void {
    this.getMainWindow = provider;
  }

  async show(input: {
    targetId: string;
    bounds: BrowserViewBounds;
  }): Promise<BrowserViewSnapshot> {
    const target = this.ensureTarget(input.targetId);
    const mainWindow = this.requireMainWindow();

    this.hideOthers(input.targetId);
    mainWindow.contentView.addChildView(target.view);
    target.view.setBounds(toRectangle(input.bounds));
    target.view.setVisible(true);
    target.snapshot = readSnapshot(target);
    target.snapshot.isVisible = true;
    this.emitSnapshot(target);

    return target.snapshot;
  }

  async hide(targetId: string): Promise<void> {
    const target = this.targets.get(targetId);

    if (!target) {
      return;
    }

    target.view.setVisible(false);
    target.snapshot = readSnapshot(target);
    target.snapshot.isVisible = false;
    this.emitSnapshot(target);
  }

  async updateBounds(input: {
    targetId: string;
    bounds: BrowserViewBounds;
  }): Promise<void> {
    const target = this.targets.get(input.targetId);

    if (!target) {
      return;
    }

    target.view.setBounds(toRectangle(input.bounds));
  }

  async navigate(input: {
    targetId: string;
    url: string;
  }): Promise<BrowserViewSnapshot> {
    const target = this.ensureTarget(input.targetId);
    const navigationUrl = input.url.trim();

    if (!isAllowedBrowserUrl(navigationUrl)) {
      throw new Error('Only HTTPS URLs and local HTTP development URLs are allowed.');
    }

    target.snapshot = {
      ...readSnapshot(target),
      lastLoadError: null,
    };
    this.emitSnapshot(target);
    try {
      await target.view.webContents.loadURL(navigationUrl);
    } catch {
      // Chromium will render its own navigation error page for transient network
      // failures like an offline local dev server, so avoid surfacing those as
      // command failures in the app chrome.
    }
    target.snapshot = readSnapshot(target);
    this.emitSnapshot(target);

    return target.snapshot;
  }

  async goBack(targetId: string): Promise<BrowserViewSnapshot> {
    const target = this.ensureTarget(targetId);

    if (target.view.webContents.canGoBack()) {
      target.view.webContents.goBack();
    }

    target.snapshot = readSnapshot(target);
    this.emitSnapshot(target);

    return target.snapshot;
  }

  async goForward(targetId: string): Promise<BrowserViewSnapshot> {
    const target = this.ensureTarget(targetId);

    if (target.view.webContents.canGoForward()) {
      target.view.webContents.goForward();
    }

    target.snapshot = readSnapshot(target);
    this.emitSnapshot(target);

    return target.snapshot;
  }

  async reload(targetId: string): Promise<BrowserViewSnapshot> {
    const target = this.ensureTarget(targetId);

    target.view.webContents.reload();
    target.snapshot = readSnapshot(target);
    this.emitSnapshot(target);

    return target.snapshot;
  }

  async openDevTools(targetId: string): Promise<void> {
    const target = this.ensureTarget(targetId);

    target.view.webContents.openDevTools({ mode: 'detach' });
  }

  async disposeTarget(targetId: string): Promise<void> {
    const target = this.targets.get(targetId);

    if (!target) {
      return;
    }

    const mainWindow = this.getMainWindow();

    mainWindow?.contentView.removeChildView(target.view);
    target.view.setVisible(false);

    await Promise.allSettled([
      target.session.clearStorageData(),
      target.session.clearCache(),
    ]);

    if (!target.view.webContents.isDestroyed()) {
      target.view.webContents.close({ waitForBeforeUnload: false });
    }

    this.targets.delete(targetId);
  }

  dispose(): void {
    for (const targetId of [...this.targets.keys()]) {
      void this.disposeTarget(targetId);
    }
  }

  private ensureTarget(targetId: string): ManagedBrowserTarget {
    const existing = this.targets.get(targetId);

    if (existing && !existing.view.webContents.isDestroyed()) {
      return existing;
    }

    const partition = createBrowserPartition(targetId);
    const browserSession = session.fromPartition(partition);
    configureBrowserSession(browserSession);

    const view = new WebContentsView({
      webPreferences: {
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        devTools: true,
      },
    });

    view.setVisible(false);
    view.setBackgroundColor('#ffffff');

    const target: ManagedBrowserTarget = {
      targetId,
      partition,
      session: browserSession,
      view,
      snapshot: createSnapshot(targetId),
    };

    view.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedBrowserUrl(url)) {
        void this.navigate({ targetId, url }).catch(() => undefined);
      } else {
        maybeOpenExternalUrl(url);
      }

      return { action: 'deny' };
    });

    view.webContents.on('will-navigate', (event, navigationUrl) => {
      if (isAllowedBrowserUrl(navigationUrl)) {
        return;
      }

      event.preventDefault();
      maybeOpenExternalUrl(navigationUrl);
    });

    view.webContents.on('did-start-loading', () => {
      target.snapshot = {
        ...readSnapshot(target),
        lastLoadError: null,
      };
      this.emitSnapshot(target);
    });

    view.webContents.on('did-stop-loading', () => {
      target.snapshot = readSnapshot(target);
      this.emitSnapshot(target);
    });

    view.webContents.on('did-navigate', () => {
      target.snapshot = readSnapshot(target);
      this.emitSnapshot(target);
    });

    view.webContents.on('did-navigate-in-page', () => {
      target.snapshot = readSnapshot(target);
      this.emitSnapshot(target);
    });

    view.webContents.on('page-title-updated', () => {
      target.snapshot = readSnapshot(target);
      this.emitSnapshot(target);
    });

    view.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
        if (!isMainFrame || errorCode === ERR_ABORTED) {
          return;
        }

        target.snapshot = {
          ...readSnapshot(target),
          currentUrl: validatedUrl || target.snapshot.currentUrl,
          lastLoadError: errorDescription,
        };
        this.emitSnapshot(target);
      },
    );

    this.targets.set(targetId, target);

    return target;
  }

  private emitSnapshot(target: ManagedBrowserTarget): void {
    this.emit('event', {
      type: 'snapshot',
      snapshot: target.snapshot,
    });
  }

  private hideOthers(activeTargetId: string): void {
    for (const [targetId, target] of this.targets.entries()) {
      if (targetId === activeTargetId || !target.snapshot.isVisible) {
        continue;
      }

      target.view.setVisible(false);
      target.snapshot = readSnapshot(target);
      target.snapshot.isVisible = false;
      this.emitSnapshot(target);
    }
  }

  private requireMainWindow(): BrowserWindow {
    const mainWindow = this.getMainWindow();

    if (mainWindow === null || mainWindow.isDestroyed()) {
      throw new Error('The main window is not available.');
    }

    return mainWindow;
  }
}

export const targetBrowserManager = new TargetBrowserManager();
