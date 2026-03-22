import { PlusIcon, XIcon } from 'lucide-react';

import { BrowserViewPanel } from '@/renderer/code-screen/browser/browser-view-panel';
import { getBrowserTabLabel } from '@/renderer/code-screen/browser/browser-panel-state';
import { useBrowserViewsState } from '@/renderer/code-screen/browser/browser-view-state';
import type { BrowserTab } from '@/renderer/code-screen/use-browser-tabs';
import { cn } from '@/shadcn/lib/utils';

export function TargetBrowserPanel({
  codeTargetId,
  tabs,
  activeTabId,
  onAddTab,
  onChangeTab,
  onCloseTab,
}: {
  codeTargetId: string;
  tabs: BrowserTab[];
  activeTabId: string;
  onAddTab: () => void;
  onChangeTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
}) {
  const canCloseTabs = tabs.length > 1;
  const browserViewIds = tabs.map((tab) => tab.id);
  const {
    getSnapshot,
    getRememberedPageTitle,
    getRememberedUrl,
    setRememberedUrl,
  } = useBrowserViewsState(codeTargetId, browserViewIds);
  const activeSnapshot = getSnapshot(activeTabId);
  const activeRememberedUrl = getRememberedUrl(activeTabId);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-stretch border-b border-border bg-muted/30">
        <div className="flex min-w-0 items-stretch overflow-x-auto">
          {tabs.map((tab) => {
            const snapshot = getSnapshot(tab.id);
            const isActive = tab.id === activeTabId;
            const rememberedUrl = getRememberedUrl(tab.id);
            const rememberedPageTitle = getRememberedPageTitle(tab.id);
            const label = getBrowserTabLabel({
              currentUrl: snapshot.currentUrl,
              rememberedUrl,
              pageTitle: snapshot.pageTitle,
              rememberedPageTitle,
            });

            return (
              <div
                key={tab.id}
                className={cn(
                  'group/browser-tab relative flex w-56 shrink-0 items-center border-r border-border px-3 py-2 text-xs transition-colors h-8',
                  isActive
                    ? 'bg-background text-foreground'
                    : 'text-muted-foreground hover:bg-background/50 hover:text-foreground',
                )}
              >
                <button
                  type="button"
                  onClick={() => onChangeTab(tab.id)}
                  className="min-w-0 flex-1 truncate text-left"
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={`Open ${label}`}
                  title={label}
                >
                  {label}
                </button>

                {canCloseTabs ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                    className="ml-2 flex size-5 items-center justify-center rounded opacity-0 transition-all hover:bg-muted group-hover/browser-tab:opacity-60 group-hover/browser-tab:hover:opacity-100"
                    aria-label={`Close ${label}`}
                  >
                    <XIcon className="size-3" />
                  </button>
                ) : null}
              </div>
            );
          })}

          <button
            type="button"
            onClick={onAddTab}
            className="flex w-9 shrink-0 items-center justify-center text-muted-foreground/70 transition-colors hover:bg-background/50 hover:text-foreground"
            aria-label="New browser tab"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </div>
      </div>

      <BrowserViewPanel
        browserViewId={activeTabId}
        codeTargetId={codeTargetId}
        snapshot={activeSnapshot}
        rememberedUrl={activeRememberedUrl}
        onRememberedUrlChange={(nextUrl) => setRememberedUrl(activeTabId, nextUrl)}
      />
    </div>
  );
}
