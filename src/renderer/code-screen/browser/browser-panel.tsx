import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ExternalLinkIcon,
  GlobeIcon,
  LoaderCircleIcon,
  RefreshCcwIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import { normalizeBrowserUrlInput } from '@/renderer/code-screen/browser/browser-url';
import { useBrowserTargetState } from '@/renderer/code-screen/browser/browser-target-state';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Button } from '@/shadcn/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/shadcn/components/ui/input-group';
import { cn } from '@/shadcn/lib/utils';

const BLANK_PAGE_URL = 'about:blank';

function BrowserViewportHost({
  className,
  targetId,
  visible,
}: {
  className?: string;
  targetId: string;
  visible: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const hasShownRef = useRef(false);

  const syncBounds = useCallback(async () => {
    const viewport = viewportRef.current;

    if (!viewport || !visible) {
      return;
    }

    const rect = viewport.getBoundingClientRect();

    if (rect.width < 1 || rect.height < 1) {
      return;
    }

    const bounds = {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };

    if (!hasShownRef.current) {
      hasShownRef.current = true;
      await window.electronAPI.showBrowserView({ targetId, bounds });
      return;
    }

    await window.electronAPI.updateBrowserViewBounds({ targetId, bounds });
  }, [targetId, visible]);

  useEffect(() => {
    if (!visible) {
      hasShownRef.current = false;
      void window.electronAPI.hideBrowserView(targetId).catch(() => undefined);
      return;
    }

    void syncBounds();

    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const scheduleSync = () => {
      window.requestAnimationFrame(() => {
        void syncBounds();
      });
    };

    const resizeObserver = new ResizeObserver(scheduleSync);
    resizeObserver.observe(viewport);
    window.addEventListener('resize', scheduleSync);
    window.addEventListener('scroll', scheduleSync, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleSync);
      window.removeEventListener('scroll', scheduleSync, true);
      hasShownRef.current = false;
      void window.electronAPI.hideBrowserView(targetId).catch(() => undefined);
    };
  }, [syncBounds, targetId, visible]);

  return (
    <div
      ref={viewportRef}
      className={cn('min-h-0 flex-1 rounded-xl border bg-background shadow-sm', className)}
    />
  );
}

export function BrowserPanel({
  targetId,
  className,
}: {
  targetId: string;
  className?: string;
}) {
  const { snapshot, rememberedUrl, setRememberedUrl } = useBrowserTargetState(targetId);
  const [addressValue, setAddressValue] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const shouldShowBrowser =
    snapshot.currentUrl !== BLANK_PAGE_URL || rememberedUrl.trim().length > 0;

  useEffect(() => {
    setAddressValue(
      snapshot.currentUrl !== BLANK_PAGE_URL ? snapshot.currentUrl : rememberedUrl,
    );
  }, [rememberedUrl, snapshot.currentUrl]);

  useEffect(() => {
    if (snapshot.currentUrl !== BLANK_PAGE_URL || rememberedUrl.trim().length === 0) {
      return;
    }

    void window.electronAPI.navigateBrowserView({
      targetId,
      url: rememberedUrl,
    }).catch(() => undefined);
  }, [rememberedUrl, snapshot.currentUrl, targetId]);

  const handleNavigate = useCallback(async (nextValue: string) => {
    const normalizedUrl = normalizeBrowserUrlInput(nextValue);

    if (normalizedUrl === null) {
      setSubmitError('Enter a valid URL such as localhost:3000 or https://example.com.');
      return;
    }

    setSubmitError(null);

    if (normalizedUrl === BLANK_PAGE_URL) {
      setRememberedUrl(null);
    } else {
      setRememberedUrl(normalizedUrl);
    }

    await window.electronAPI.navigateBrowserView({
      targetId,
      url: normalizedUrl,
    });
  }, [setRememberedUrl, targetId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      await handleNavigate(addressValue);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to navigate the browser tab.',
      );
    }
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-3 bg-muted/20 p-3', className)}>
      <form className="flex items-center gap-2" onSubmit={handleSubmit}>
        <InputGroup className="h-10 bg-background">
          <InputGroupAddon>
            <InputGroupButton
              aria-label="Go back"
              disabled={!snapshot.canGoBack}
              onClick={() => {
                void window.electronAPI.goBackBrowserView(targetId).catch(() => undefined);
              }}
              size="icon-sm"
              variant="ghost"
            >
              <ArrowLeftIcon />
            </InputGroupButton>
            <InputGroupButton
              aria-label="Go forward"
              disabled={!snapshot.canGoForward}
              onClick={() => {
                void window.electronAPI.goForwardBrowserView(targetId).catch(() => undefined);
              }}
              size="icon-sm"
              variant="ghost"
            >
              <ArrowRightIcon />
            </InputGroupButton>
            <InputGroupButton
              aria-label="Reload"
              onClick={() => {
                void window.electronAPI.reloadBrowserView(targetId).catch(() => undefined);
              }}
              size="icon-sm"
              variant="ghost"
            >
              <RefreshCcwIcon />
            </InputGroupButton>
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Browser address"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            onChange={(event) => {
              setAddressValue(event.target.value);
              if (submitError) {
                setSubmitError(null);
              }
            }}
            placeholder="localhost:3000 or https://example.com"
            spellCheck={false}
            type="text"
            value={addressValue}
          />
          <InputGroupAddon align="inline-end">
            {snapshot.isLoading ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <GlobeIcon />
            )}
            <InputGroupButton size="sm" type="submit" variant="outline">
              Open
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => {
            void window.electronAPI.openBrowserViewDevTools(targetId).catch(() => undefined);
          }}
        >
          <ExternalLinkIcon data-icon="inline-start" />
          DevTools
        </Button>
      </form>

      {submitError ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Browser navigation failed</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}

      {shouldShowBrowser ? (
        <BrowserViewportHost targetId={targetId} visible={shouldShowBrowser} />
      ) : (
        <Empty className="min-h-0 flex-1 border-border/60 bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GlobeIcon />
            </EmptyMedia>
            <EmptyTitle>Open the app for this target</EmptyTitle>
            <EmptyDescription>
              Use a local development URL like <code>localhost:3000</code> or load a
              production HTTPS page to verify this Codex target in isolation.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            Each code target gets its own browser storage partition, so auth state,
            cookies, local storage, and caches stay isolated from the other sessions.
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}
