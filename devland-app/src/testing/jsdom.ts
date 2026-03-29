import { JSDOM } from 'jsdom';

type ObserverCallback = (...args: unknown[]) => void;

class NoopResizeObserver {
  public constructor(_callback: ObserverCallback) {}

  public observe() {}

  public unobserve() {}

  public disconnect() {}
}

class NoopIntersectionObserver {
  public readonly root = null;
  public readonly rootMargin = '';
  public readonly thresholds = [0];

  public constructor(_callback: ObserverCallback) {}

  public observe() {}

  public unobserve() {}

  public disconnect() {}

  public takeRecords() {
    return [];
  }
}

function defineGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

export function installJSDOM() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/',
  });
  const { window } = dom;
  const previousValues = new Map<string, PropertyDescriptor | undefined>();

  const assignGlobal = (name: string, value: unknown) => {
    previousValues.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    defineGlobal(name, value);
  };

  assignGlobal('window', window);
  assignGlobal('document', window.document);
  assignGlobal('navigator', window.navigator);
  assignGlobal('Node', window.Node);
  assignGlobal('Element', window.Element);
  assignGlobal('HTMLElement', window.HTMLElement);
  assignGlobal('HTMLButtonElement', window.HTMLButtonElement);
  assignGlobal('HTMLInputElement', window.HTMLInputElement);
  assignGlobal('HTMLTextAreaElement', window.HTMLTextAreaElement);
  assignGlobal('SVGElement', window.SVGElement);
  assignGlobal('ShadowRoot', window.ShadowRoot);
  assignGlobal('DocumentFragment', window.DocumentFragment);
  assignGlobal('Text', window.Text);
  assignGlobal('Event', window.Event);
  assignGlobal('MouseEvent', window.MouseEvent);
  assignGlobal('PointerEvent', window.PointerEvent ?? window.MouseEvent);
  assignGlobal('KeyboardEvent', window.KeyboardEvent);
  assignGlobal('CustomEvent', window.CustomEvent);
  assignGlobal('MutationObserver', window.MutationObserver);
  assignGlobal('getComputedStyle', window.getComputedStyle.bind(window));
  assignGlobal('ResizeObserver', NoopResizeObserver);
  assignGlobal('IntersectionObserver', NoopIntersectionObserver);
  assignGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(window.performance.now()), 0));
  assignGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
  assignGlobal('IS_REACT_ACT_ENVIRONMENT', true);

  window.HTMLElement.prototype.scrollIntoView = () => {};

  return () => {
    for (const [name, descriptor] of previousValues) {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        delete (globalThis as Record<string, unknown>)[name];
      }
    }

    dom.window.close();
  };
}
