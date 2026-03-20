import { BotIcon, FileCodeIcon, GlobeIcon, TerminalIcon } from 'lucide-react';
import { LayoutGroup, motion } from 'motion/react';

import type { CodeWorkspacePane } from '@/ipc/contracts';
import { cn } from '@/shadcn/lib/utils';

const LAYER_TABS: { id: CodeWorkspacePane; label: string; icon: typeof BotIcon }[] = [
  { id: 'changes', label: 'Changes', icon: FileCodeIcon },
  { id: 'codex', label: 'Codex', icon: BotIcon },
  { id: 'browser', label: 'Browser', icon: GlobeIcon },
  { id: 'terminal', label: 'Terminal', icon: TerminalIcon },
];

export function LayerToggle({
  activePaneId,
  onChangePane,
  codexMenu,
}: {
  activePaneId: CodeWorkspacePane;
  onChangePane: (paneId: CodeWorkspacePane) => void;
  codexMenu: React.ReactNode;
}) {
  return (
    <LayoutGroup id="layer-toggle">
      <div className="flex items-center gap-0.5 border-b border-border bg-muted/30 px-3 py-1.5">
        {LAYER_TABS.map((tab) => {
          const isActive = activePaneId === tab.id;
          const TabIcon = tab.icon;
          const tabClassName = cn(
            'relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            isActive
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          );

          if (tab.id === 'codex') {
            return (
              <div key={tab.id} className="relative flex items-center rounded-md">
                {isActive ? (
                  <motion.div
                    layoutId="layer-toggle-pill"
                    className="absolute inset-0 z-0 rounded-md bg-background shadow-sm"
                    transition={{ type: 'tween', duration: 0.1 }}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => onChangePane(tab.id)}
                  className={cn(tabClassName, 'z-10 rounded-r-sm pr-1.5')}
                >
                  <TabIcon className="size-3" />
                  <span>Codex</span>
                </button>
                <div className="relative z-10 mr-1 flex items-center">
                  {codexMenu}
                </div>
              </div>
            );
          }

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangePane(tab.id)}
              className={tabClassName}
            >
              {isActive ? (
                <motion.div
                  layoutId="layer-toggle-pill"
                  className="absolute inset-0 z-0 rounded-md bg-background shadow-sm"
                  transition={{ type: 'tween', duration: 0.1 }}
                />
              ) : null}
              <TabIcon className="relative z-10 size-3" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
