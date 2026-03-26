import { EventEmitter } from 'node:events';

import {
  BrowserWindow,
  WebContentsView,
  session,
  shell,
  type Rectangle,
  type Session,
  type WebContents,
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

export type BrowserPageElement = {
  selector: string;
  tagName: string;
  role: string | null;
  text: string;
  value: string | null;
  placeholder: string | null;
  name: string | null;
  type: string | null;
  ariaLabel: string | null;
  title: string | null;
  href: string | null;
  disabled: boolean;
  visible: boolean;
  checked: boolean | null;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type BrowserPageInspection = {
  snapshot: BrowserViewSnapshot;
  readyState: string;
  activeSelector: string | null;
  element: BrowserPageElement | null;
  elements: BrowserPageElement[];
};

export type BrowserPageInteractionResult = {
  snapshot: BrowserViewSnapshot;
  element: BrowserPageElement;
};

export type BrowserPageScreenshot = {
  snapshot: BrowserViewSnapshot;
  pngBytes: Buffer;
};

const BLANK_PAGE_URL = 'about:blank';
const ERR_ABORTED = -3;
const INTERACTION_SETTLE_DELAY_MS = 75;
const INTERACTION_LOAD_TIMEOUT_MS = 4_000;
const PAGE_SCRIPT_UTILITIES = String.raw`
const MAX_TEXT_LENGTH = 200;
const MAX_VALUE_LENGTH = 160;
const MAX_INSPECTABLE_ELEMENTS = 48;
const trimText = (value, maxLength = MAX_TEXT_LENGTH) => {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength
    ? normalized
    : normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
};
const rectToJson = (rect) => ({
  x: Math.round(rect.left),
  y: Math.round(rect.top),
  width: Math.round(rect.width),
  height: Math.round(rect.height),
});
const isVisible = (element) => {
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) {
    return false;
  }
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
};
const isUniqueSelector = (selector) => {
  if (!selector) {
    return false;
  }
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
};
const buildPathSelector = (element) => {
  const segments = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
    const tagName = current.tagName.toLowerCase();
    if (current.id && isUniqueSelector('#' + CSS.escape(current.id))) {
      segments.unshift('#' + CSS.escape(current.id));
      return segments.join(' > ');
    }
    const parent = current.parentElement;
    if (!parent) {
      segments.unshift(tagName);
      break;
    }
    const siblings = [...parent.children].filter((candidate) => candidate.tagName === current.tagName);
    const index = siblings.indexOf(current);
    segments.unshift(
      siblings.length > 1 ? tagName + ':nth-of-type(' + String(index + 1) + ')' : tagName,
    );
    current = parent;
  }
  return segments.join(' > ');
};
const buildUniqueSelector = (element) => {
  const tagName = element.tagName.toLowerCase();
  const id = element.getAttribute('id');
  if (id) {
    const selector = '#' + CSS.escape(id);
    if (isUniqueSelector(selector)) {
      return selector;
    }
  }
  const dataTestId = element.getAttribute('data-testid');
  if (dataTestId) {
    const selector = '[data-testid="' + CSS.escape(dataTestId) + '"]';
    if (isUniqueSelector(selector)) {
      return selector;
    }
  }
  const name = element.getAttribute('name');
  if (name) {
    const selector = tagName + '[name="' + CSS.escape(name) + '"]';
    if (isUniqueSelector(selector)) {
      return selector;
    }
  }
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    const selector = tagName + '[aria-label="' + CSS.escape(ariaLabel) + '"]';
    if (isUniqueSelector(selector)) {
      return selector;
    }
  }
  const placeholder = element.getAttribute('placeholder');
  if (placeholder) {
    const selector = tagName + '[placeholder="' + CSS.escape(placeholder) + '"]';
    if (isUniqueSelector(selector)) {
      return selector;
    }
  }
  return buildPathSelector(element);
};
const queryElement = (selector) => {
  try {
    return document.querySelector(selector);
  } catch {
    throw new Error('Invalid selector: ' + selector);
  }
};
const requireElement = (selector) => {
  const element = queryElement(selector);
  if (!element) {
    throw new Error('No element matched selector: ' + selector);
  }
  return element;
};
const serializeElement = (element) => {
  if (!element) {
    return null;
  }
  const value =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
      ? element.value
      : element instanceof HTMLElement && element.isContentEditable
        ? element.innerText
        : null;
  const href = element instanceof HTMLAnchorElement ? element.href : element.getAttribute('href');
  return {
    selector: buildUniqueSelector(element),
    tagName: element.tagName.toLowerCase(),
    role: element.getAttribute('role'),
    text: trimText('innerText' in element ? element.innerText : element.textContent ?? ''),
    value: value === null ? null : trimText(value, MAX_VALUE_LENGTH),
    placeholder: element.getAttribute('placeholder'),
    name: element.getAttribute('name'),
    type: element instanceof HTMLInputElement ? element.type : null,
    ariaLabel: element.getAttribute('aria-label'),
    title: element.getAttribute('title'),
    href: href || null,
    disabled:
      'disabled' in element
        ? Boolean(element.disabled)
        : element.getAttribute('aria-disabled') === 'true',
    visible: isVisible(element),
    checked: element instanceof HTMLInputElement ? element.checked : null,
    rect: rectToJson(element.getBoundingClientRect()),
  };
};
const collectInspectableElements = () => {
  const selector = [
    'button',
    'a[href]',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[role="link"]',
    '[role="textbox"]',
    '[data-testid]',
  ].join(',');
  const elements = [];
  const seenSelectors = new Set();
  for (const candidate of document.querySelectorAll(selector)) {
    if (!isVisible(candidate)) {
      continue;
    }
    const serialized = serializeElement(candidate);
    if (!serialized || seenSelectors.has(serialized.selector)) {
      continue;
    }
    seenSelectors.add(serialized.selector);
    elements.push(serialized);
    if (elements.length >= MAX_INSPECTABLE_ELEMENTS) {
      break;
    }
  }
  return elements;
};
`;

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

  async inspect(input: {
    browserViewId: string;
    codeTargetId: string;
    selector?: string | null;
  }): Promise<BrowserPageInspection> {
    const browserView = this.ensureBrowserView(input.browserViewId, input.codeTargetId);
    const selector = input.selector?.trim() || null;
    const inspection = await this.executePageScript<{
      readyState: string;
      activeSelector: string | null;
      element: BrowserPageElement | null;
      elements: BrowserPageElement[];
    }>(
      browserView,
      `(() => {
        ${PAGE_SCRIPT_UTILITIES}
        const selector = ${JSON.stringify(selector)};
        const activeElement =
          document.activeElement && document.activeElement !== document.body
            ? serializeElement(document.activeElement)
            : null;
        const targetElement = selector ? serializeElement(requireElement(selector)) : null;
        return {
          readyState: document.readyState,
          activeSelector: activeElement?.selector ?? null,
          element: targetElement,
          elements: selector ? [] : collectInspectableElements(),
        };
      })()`,
    );

    browserView.snapshot = readSnapshot(browserView);
    this.emitSnapshot(browserView);

    return {
      snapshot: browserView.snapshot,
      readyState: inspection.readyState,
      activeSelector: inspection.activeSelector,
      element: inspection.element,
      elements: inspection.elements,
    };
  }

  async click(input: {
    browserViewId: string;
    codeTargetId: string;
    selector: string;
  }): Promise<BrowserPageInteractionResult> {
    const browserView = this.ensureBrowserView(input.browserViewId, input.codeTargetId);
    const result = await this.executePageScript<{
      clickPoint: { x: number; y: number };
      element: BrowserPageElement;
    }>(
      browserView,
      `(() => {
        ${PAGE_SCRIPT_UTILITIES}
        const selector = ${JSON.stringify(input.selector.trim())};
        const element = requireElement(selector);
        if (!isVisible(element)) {
          throw new Error('Element is not visible: ' + selector);
        }
        element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        if (element instanceof HTMLElement) {
          element.focus({ preventScroll: true });
        }
        const rect = element.getBoundingClientRect();
        return {
          clickPoint: {
            x: Math.round(rect.left + rect.width / 2),
            y: Math.round(rect.top + rect.height / 2),
          },
          element: serializeElement(element),
        };
      })()`,
    );

    browserView.view.webContents.sendInputEvent({
      type: 'mouseMove',
      x: result.clickPoint.x,
      y: result.clickPoint.y,
      button: 'left',
    });
    browserView.view.webContents.sendInputEvent({
      type: 'mouseDown',
      x: result.clickPoint.x,
      y: result.clickPoint.y,
      button: 'left',
      clickCount: 1,
    });
    browserView.view.webContents.sendInputEvent({
      type: 'mouseUp',
      x: result.clickPoint.x,
      y: result.clickPoint.y,
      button: 'left',
      clickCount: 1,
    });
    await this.waitForInteractionToSettle(browserView.view.webContents);

    browserView.snapshot = readSnapshot(browserView);
    this.emitSnapshot(browserView);

    return {
      snapshot: browserView.snapshot,
      element: result.element,
    };
  }

  async typeIntoElement(input: {
    browserViewId: string;
    codeTargetId: string;
    selector: string;
    text: string;
  }): Promise<BrowserPageInteractionResult> {
    const browserView = this.ensureBrowserView(input.browserViewId, input.codeTargetId);
    const result = await this.executePageScript<{ element: BrowserPageElement }>(
      browserView,
      `(() => {
        ${PAGE_SCRIPT_UTILITIES}
        const selector = ${JSON.stringify(input.selector.trim())};
        const nextValue = ${JSON.stringify(input.text)};
        const element = requireElement(selector);
        if (!isVisible(element)) {
          throw new Error('Element is not visible: ' + selector);
        }
        const setElementValue = (target, value) => {
          if (target instanceof HTMLInputElement) {
            const descriptor = Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              'value',
            );
            descriptor?.set?.call(target, value);
            return;
          }
          if (target instanceof HTMLTextAreaElement) {
            const descriptor = Object.getOwnPropertyDescriptor(
              HTMLTextAreaElement.prototype,
              'value',
            );
            descriptor?.set?.call(target, value);
            return;
          }
          if (target instanceof HTMLSelectElement) {
            target.value = value;
            return;
          }
          if (target instanceof HTMLElement && target.isContentEditable) {
            target.textContent = value;
            return;
          }
          throw new Error('Element does not accept text input: ' + selector);
        };
        element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        if (element instanceof HTMLElement) {
          element.focus({ preventScroll: true });
        }
        setElementValue(element, nextValue);
        element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        return {
          element: serializeElement(element),
        };
      })()`,
    );
    await this.waitForInteractionToSettle(browserView.view.webContents);

    browserView.snapshot = readSnapshot(browserView);
    this.emitSnapshot(browserView);

    return {
      snapshot: browserView.snapshot,
      element: result.element,
    };
  }

  async captureScreenshot(input: {
    browserViewId: string;
    codeTargetId: string;
  }): Promise<BrowserPageScreenshot> {
    const browserView = this.ensureBrowserView(input.browserViewId, input.codeTargetId);
    const image = await browserView.view.webContents.capturePage();

    browserView.snapshot = readSnapshot(browserView);
    this.emitSnapshot(browserView);

    return {
      snapshot: browserView.snapshot,
      pngBytes: image.toPNG(),
    };
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

  private async executePageScript<T>(
    browserView: ManagedBrowserView,
    script: string,
  ): Promise<T> {
    return browserView.view.webContents.mainFrame.executeJavaScript(script, true) as Promise<T>;
  }

  private async waitForInteractionToSettle(webContents: WebContents): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, INTERACTION_SETTLE_DELAY_MS);
    });

    if (!webContents.isLoadingMainFrame()) {
      return;
    }

    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timeoutId);
        webContents.off('did-stop-loading', finish);
        webContents.off('did-fail-load', finish);
        resolve();
      };
      const timeoutId = setTimeout(finish, INTERACTION_LOAD_TIMEOUT_MS);

      webContents.on('did-stop-loading', finish);
      webContents.on('did-fail-load', finish);
    });
  }
}

export const browserViewManager = new BrowserViewManager();
