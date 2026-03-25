import { EventEmitter } from 'node:events';

import {
  BrowserWindow,
  WebContentsView,
  session,
  shell,
  type Rectangle,
  type Session,
} from 'electron';

import {
  type AppShortcutCommand,
  type BrowserViewBounds,
  type BrowserViewEvent,
  type BrowserViewSnapshot,
} from '@/ipc/contracts';
import {
  createBrowserPartition,
  isAllowedBrowserUrl,
  isSafeExternalUrl,
} from '@/main-process/browser/browser-session-utils';
import { registerAppShortcutForwarding } from '@/main-process/app-shortcuts';

type ManagedBrowserView = {
  browserViewId: string;
  codeTargetId: string;
  view: WebContentsView;
  snapshot: BrowserViewSnapshot;
};

type TargetBrowserSession = {
  codeTargetId: string;
  partition: string;
  session: Session;
  browserViewIds: Set<string>;
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
  browserViewId: string,
  codeTargetId: string,
  current: Partial<BrowserViewSnapshot> = {},
): BrowserViewSnapshot => ({
  browserViewId,
  codeTargetId,
  currentUrl: current.currentUrl ?? BLANK_PAGE_URL,
  pageTitle: current.pageTitle ?? '',
  canGoBack: current.canGoBack ?? false,
  canGoForward: current.canGoForward ?? false,
  isLoading: current.isLoading ?? false,
  isVisible: current.isVisible ?? false,
  lastLoadError: current.lastLoadError ?? null,
});

const readSnapshot = (browserView: ManagedBrowserView): BrowserViewSnapshot => ({
  ...browserView.snapshot,
  currentUrl: browserView.view.webContents.getURL() || BLANK_PAGE_URL,
  pageTitle: browserView.view.webContents.getTitle(),
  canGoBack: browserView.view.webContents.canGoBack(),
  canGoForward: browserView.view.webContents.canGoForward(),
  isLoading: browserView.view.webContents.isLoadingMainFrame(),
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

export class BrowserViewManager extends EventEmitter<{
  event: [BrowserViewEvent];
}> {
  private readonly browserViews = new Map<string, ManagedBrowserView>();

  private readonly targetSessions = new Map<string, TargetBrowserSession>();

  private readonly activeBrowserViewIdByTarget = new Map<string, string>();

  private getMainWindow: () => BrowserWindow | null = () => null;

  private dispatchAppShortcutCommand: (command: AppShortcutCommand) => void = () => undefined;

  setMainWindowProvider(provider: () => BrowserWindow | null): void {
    this.getMainWindow = provider;
  }

  setAppShortcutCommandDispatcher(
    dispatcher: (command: AppShortcutCommand) => void,
  ): void {
    this.dispatchAppShortcutCommand = dispatcher;
  }

  async show(input: {
    browserViewId: string;
    codeTargetId: string;
    bounds: BrowserViewBounds;
  }): Promise<BrowserViewSnapshot> {
    const browserView = this.ensureBrowserView(input.browserViewId, input.codeTargetId);
    const mainWindow = this.requireMainWindow();

    this.hideOthers(input.browserViewId);
    mainWindow.contentView.addChildView(browserView.view);
    browserView.view.setBounds(toRectangle(input.bounds));
    browserView.view.setVisible(true);
    browserView.snapshot = readSnapshot(browserView);
    browserView.snapshot.isVisible = true;
    this.emitSnapshot(browserView);

    return browserView.snapshot;
  }

  async hide(browserViewId: string): Promise<void> {
    const browserView = this.browserViews.get(browserViewId);

    if (!browserView) {
      return;
    }

    browserView.view.setVisible(false);
    browserView.snapshot = readSnapshot(browserView);
    browserView.snapshot.isVisible = false;
    this.emitSnapshot(browserView);
  }

  async updateBounds(input: {
    browserViewId: string;
    bounds: BrowserViewBounds;
  }): Promise<void> {
    const browserView = this.browserViews.get(input.browserViewId);

    if (!browserView) {
      return;
    }

    browserView.view.setBounds(toRectangle(input.bounds));
  }

  async navigate(input: {
    browserViewId: string;
    codeTargetId: string;
    url: string;
  }): Promise<BrowserViewSnapshot> {
    const browserView = this.ensureBrowserView(input.browserViewId, input.codeTargetId);
    const navigationUrl = input.url.trim();

    if (!isAllowedBrowserUrl(navigationUrl)) {
      throw new Error('Only HTTPS URLs and local HTTP development URLs are allowed.');
    }

    browserView.snapshot = {
      ...readSnapshot(browserView),
      lastLoadError: null,
    };
    this.emitSnapshot(browserView);

    try {
      await browserView.view.webContents.loadURL(navigationUrl);
    } catch {
      // Chromium renders its own transient navigation error pages.
    }

    browserView.snapshot = readSnapshot(browserView);
    this.emitSnapshot(browserView);

    return browserView.snapshot;
  }

  async goBack(browserViewId: string): Promise<BrowserViewSnapshot> {
    const browserView = this.requireBrowserView(browserViewId);

    if (browserView.view.webContents.canGoBack()) {
      browserView.view.webContents.goBack();
    }

    browserView.snapshot = readSnapshot(browserView);
    this.emitSnapshot(browserView);

    return browserView.snapshot;
  }

  async goForward(browserViewId: string): Promise<BrowserViewSnapshot> {
    const browserView = this.requireBrowserView(browserViewId);

    if (browserView.view.webContents.canGoForward()) {
      browserView.view.webContents.goForward();
    }

    browserView.snapshot = readSnapshot(browserView);
    this.emitSnapshot(browserView);

    return browserView.snapshot;
  }

  async reload(browserViewId: string): Promise<BrowserViewSnapshot> {
    const browserView = this.requireBrowserView(browserViewId);

    browserView.view.webContents.reload();
    browserView.snapshot = readSnapshot(browserView);
    this.emitSnapshot(browserView);

    return browserView.snapshot;
  }

  async getSnapshot(input: {
    browserViewId: string;
    codeTargetId: string;
  }): Promise<BrowserViewSnapshot> {
    const browserView = this.ensureBrowserView(input.browserViewId, input.codeTargetId);

    browserView.snapshot = readSnapshot(browserView);
    this.emitSnapshot(browserView);

    return browserView.snapshot;
  }

  setActiveBrowserView(input: {
    codeTargetId: string;
    browserViewId: string;
  }): void {
    this.activeBrowserViewIdByTarget.set(input.codeTargetId, input.browserViewId);
  }

  getActiveBrowserViewId(codeTargetId: string): string | null {
    return this.activeBrowserViewIdByTarget.get(codeTargetId) ?? null;
  }

  async openDevTools(browserViewId: string): Promise<void> {
    const browserView = this.requireBrowserView(browserViewId);

    browserView.view.webContents.openDevTools({ mode: 'detach' });
  }

  async disposeView(browserViewId: string): Promise<void> {
    const browserView = this.browserViews.get(browserViewId);

    if (!browserView) {
      return;
    }

    const mainWindow = this.getMainWindow();

    mainWindow?.contentView.removeChildView(browserView.view);
    browserView.view.setVisible(false);

    if (!browserView.view.webContents.isDestroyed()) {
      browserView.view.webContents.close({ waitForBeforeUnload: false });
    }

    this.browserViews.delete(browserViewId);
    const targetSession = this.targetSessions.get(browserView.codeTargetId);

    targetSession?.browserViewIds.delete(browserViewId);

    if (this.activeBrowserViewIdByTarget.get(browserView.codeTargetId) === browserViewId) {
      this.activeBrowserViewIdByTarget.delete(browserView.codeTargetId);
    }
  }

  async disposeTarget(codeTargetId: string): Promise<void> {
    const targetSession = this.targetSessions.get(codeTargetId);

    if (!targetSession) {
      return;
    }

    await Promise.all(
      [...targetSession.browserViewIds].map((browserViewId) => this.disposeView(browserViewId)),
    );
    await Promise.allSettled([
      targetSession.session.clearStorageData(),
      targetSession.session.clearCache(),
    ]);
    this.targetSessions.delete(codeTargetId);
    this.activeBrowserViewIdByTarget.delete(codeTargetId);
  }

  dispose(): void {
    this.activeBrowserViewIdByTarget.clear();

    for (const codeTargetId of [...this.targetSessions.keys()]) {
      void this.disposeTarget(codeTargetId);
    }
  }

  private ensureBrowserView(browserViewId: string, codeTargetId: string): ManagedBrowserView {
    const existing = this.browserViews.get(browserViewId);

    if (existing && !existing.view.webContents.isDestroyed()) {
      if (existing.codeTargetId !== codeTargetId) {
        throw new Error('Browser view ids must remain bound to a single code target.');
      }

      return existing;
    }

    const targetSession = this.getOrCreateTargetSession(codeTargetId);
    const view = new WebContentsView({
      webPreferences: {
        partition: targetSession.partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        devTools: true,
      },
    });

    view.setVisible(false);
    view.setBackgroundColor('#ffffff');

    const browserView: ManagedBrowserView = {
      browserViewId,
      codeTargetId,
      view,
      snapshot: createSnapshot(browserViewId, codeTargetId),
    };

    view.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedBrowserUrl(url)) {
        void this.navigate({
          browserViewId,
          codeTargetId,
          url,
        }).catch(() => undefined);
      } else {
        maybeOpenExternalUrl(url);
      }

      return { action: 'deny' };
    });
    registerAppShortcutForwarding(view.webContents, (command) => {
      this.dispatchAppShortcutCommand(command);
    });

    view.webContents.on('will-navigate', (event, navigationUrl) => {
      if (isAllowedBrowserUrl(navigationUrl)) {
        return;
      }

      event.preventDefault();
      maybeOpenExternalUrl(navigationUrl);
    });

    view.webContents.on('did-start-loading', () => {
      browserView.snapshot = {
        ...readSnapshot(browserView),
        lastLoadError: null,
      };
      this.emitSnapshot(browserView);
    });

    view.webContents.on('did-stop-loading', () => {
      browserView.snapshot = readSnapshot(browserView);
      this.emitSnapshot(browserView);
    });

    view.webContents.on('did-navigate', () => {
      browserView.snapshot = readSnapshot(browserView);
      this.emitSnapshot(browserView);
    });

    view.webContents.on('did-navigate-in-page', () => {
      browserView.snapshot = readSnapshot(browserView);
      this.emitSnapshot(browserView);
    });

    view.webContents.on('page-title-updated', () => {
      browserView.snapshot = readSnapshot(browserView);
      this.emitSnapshot(browserView);
    });

    view.webContents.on(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
        if (!isMainFrame || errorCode === ERR_ABORTED) {
          return;
        }

        browserView.snapshot = {
          ...readSnapshot(browserView),
          currentUrl: validatedUrl || browserView.snapshot.currentUrl,
          lastLoadError: errorDescription,
        };
        this.emitSnapshot(browserView);
      },
    );

    targetSession.browserViewIds.add(browserViewId);
    this.browserViews.set(browserViewId, browserView);

    return browserView;
  }

  private getOrCreateTargetSession(codeTargetId: string): TargetBrowserSession {
    const existing = this.targetSessions.get(codeTargetId);

    if (existing) {
      return existing;
    }

    const partition = createBrowserPartition(codeTargetId);
    const browserSession = session.fromPartition(partition);
    configureBrowserSession(browserSession);

    const targetSession: TargetBrowserSession = {
      codeTargetId,
      partition,
      session: browserSession,
      browserViewIds: new Set(),
    };

    this.targetSessions.set(codeTargetId, targetSession);

    return targetSession;
  }

  private requireBrowserView(browserViewId: string): ManagedBrowserView {
    const browserView = this.browserViews.get(browserViewId);

    if (!browserView || browserView.view.webContents.isDestroyed()) {
      throw new Error('The browser view is not initialized.');
    }

    return browserView;
  }

  private emitSnapshot(browserView: ManagedBrowserView): void {
    this.emit('event', {
      type: 'snapshot',
      snapshot: browserView.snapshot,
    });
  }

  private hideOthers(activeBrowserViewId: string): void {
    for (const [browserViewId, browserView] of this.browserViews.entries()) {
      if (browserViewId === activeBrowserViewId || !browserView.snapshot.isVisible) {
        continue;
      }

      browserView.view.setVisible(false);
      browserView.snapshot = readSnapshot(browserView);
      browserView.snapshot.isVisible = false;
      this.emitSnapshot(browserView);
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

export const browserViewManager = new BrowserViewManager();
