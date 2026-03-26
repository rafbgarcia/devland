import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  GithubIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react';

import type { Repo } from '@/ipc/contracts';
import type { ProjectTabId } from '@/renderer/shared/lib/projects';
import { getProjectLabel, isAbsoluteProjectPath } from '@/renderer/shared/lib/projects';
import { cn } from '@/shadcn/lib/utils';

const EDGE_TRIGGER_WIDTH = 12;
const DRAWER_WIDTH = 240;

export type DrawerTab = {
  key: string;
  label: string;
  icon: ReactNode;
  tabId: ProjectTabId;
  disabled?: boolean;
  disabledReason?: string | null;
  menu?: ReactNode;
};

type ProjectDrawerProps = {
  repos: Repo[];
  activeRepoId: string | null;
  activeTabId: ProjectTabId;
  getTabsForRepo: (repoId: string) => DrawerTab[];
  onNavigate: (repoId: string, tabId: ProjectTabId) => void;
  onRemoveRepo: (repoId: string) => void;
  onAddProject: () => void;
};

export function ProjectDrawer({
  repos,
  activeRepoId,
  activeTabId,
  getTabsForRepo,
  onNavigate,
  onRemoveRepo,
  onAddProject,
}: ProjectDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  // Listen for mouse near right edge to trigger open
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (event.clientX >= window.innerWidth - EDGE_TRIGGER_WIDTH) {
        setIsOpen(true);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <>
      {/* Invisible edge trigger zone — always present */}
      <div
        className="fixed right-0 top-0 z-50 h-full"
        style={{ width: EDGE_TRIGGER_WIDTH }}
        onMouseEnter={() => setIsOpen(true)}
      />

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-40 bg-black/20"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setIsOpen(false)}
            />

            {/* Drawer */}
            <motion.div
              ref={drawerRef}
              className="fixed right-0 top-0 z-50 flex h-full flex-col border-l border-border bg-card shadow-xl"
              style={{ width: DRAWER_WIDTH }}
              initial={{ x: DRAWER_WIDTH }}
              animate={{ x: 0 }}
              exit={{ x: DRAWER_WIDTH }}
              transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
              onMouseLeave={close}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Projects
                </span>
                <button
                  aria-label="Add project"
                  onClick={onAddProject}
                  className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  type="button"
                >
                  <PlusIcon className="size-3.5" />
                </button>
              </div>

              {/* Project list */}
              <nav className="flex-1 overflow-y-auto py-1">
                {repos.map((repo) => {
                  const isActiveRepo = repo.id === activeRepoId;
                  const tabs = getTabsForRepo(repo.id);
                  const showGithubIcon = !isAbsoluteProjectPath(repo.path);

                  return (
                    <div key={repo.id}>
                      {/* Project row */}
                      <button
                        className={cn(
                          'group flex w-full items-center gap-1 px-2 py-1.5 text-left text-xs font-medium transition-colors',
                          isActiveRepo
                            ? 'bg-muted/60 text-foreground'
                            : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                        )}
                        onClick={() => {
                          if (tabs[0]) {
                            onNavigate(repo.id, tabs[0].tabId);
                          }
                        }}
                        type="button"
                      >
                        {showGithubIcon && <GithubIcon className="size-3 shrink-0" />}
                        <span className="min-w-0 flex-1 truncate">{getProjectLabel(repo.path)}</span>
                        <span
                          className={cn(
                            'flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-muted hover:text-foreground',
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveRepo(repo.id);
                          }}
                          role="button"
                          aria-label={`Remove ${getProjectLabel(repo.path)}`}
                        >
                          <XIcon className="size-2.5" />
                        </span>
                      </button>

                      {/* Sub-tabs — always visible */}
                      <div>
                        {tabs.map((tab) => {
                          const isActiveTab =
                            isActiveRepo && tab.tabId === activeTabId;

                          return (
                            <button
                              key={tab.key}
                              className={cn(
                                'group/tab flex w-full items-center gap-2 py-1.5 pl-7 pr-2 text-left text-xs transition-colors',
                                isActiveTab
                                  ? 'bg-primary/10 text-primary font-medium'
                                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                                tab.disabled && 'cursor-not-allowed opacity-40',
                              )}
                              disabled={tab.disabled}
                              onClick={() => {
                                if (!tab.disabled) {
                                  onNavigate(repo.id, tab.tabId);
                                }
                              }}
                              title={tab.disabledReason ?? undefined}
                              type="button"
                            >
                              {tab.icon}
                              <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                              {tab.menu && (
                                <span
                                  className="shrink-0 opacity-0 transition-opacity group-hover/tab:opacity-100"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {tab.menu}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {repos.length === 0 && (
                  <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No projects yet
                  </div>
                )}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
