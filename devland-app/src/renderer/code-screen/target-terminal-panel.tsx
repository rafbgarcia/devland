import { useEffect, useRef, useState } from 'react';

import { PlusIcon, XIcon } from 'lucide-react';

import { SessionTerminal } from '@/renderer/code-screen/session-terminal';
import type { TerminalTab } from '@/renderer/code-screen/use-terminal-tabs';
import { Input } from '@/shadcn/components/ui/input';
import { cn } from '@/shadcn/lib/utils';

export function TargetTerminalPanel({
  cwd,
  tabs,
  activeTabId,
  onAddTab,
  onChangeTab,
  onCloseTab,
  onRenameTab,
}: {
  cwd: string;
  tabs: TerminalTab[];
  activeTabId: string;
  onAddTab: () => void;
  onChangeTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onRenameTab: (tabId: string, title: string) => void;
}) {
  const canCloseTabs = tabs.length > 1;
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  useEffect(() => {
    if (editingTabId === null) {
      return;
    }

    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [editingTabId]);

  const commitRename = () => {
    if (editingTabId === null) {
      return;
    }

    onRenameTab(editingTabId, draftTitle);
    setEditingTabId(null);
    setDraftTitle('');
  };

  const cancelRename = () => {
    setEditingTabId(null);
    setDraftTitle('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-stretch border-b border-border bg-muted/30">
        <div className="flex min-w-0 items-stretch overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isEditing = tab.id === editingTabId;

            return (
              <div
                key={tab.id}
                className={cn(
                  'group/terminal-tab relative flex w-40 shrink-0 items-center justify-center border-r border-border px-3 py-2 text-xs transition-colors',
                  isActive
                    ? 'bg-background text-foreground'
                    : 'text-muted-foreground hover:bg-background/50 hover:text-foreground',
                )}
              >
                {isEditing ? (
                  <input
                    ref={renameInputRef}
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitRename();
                      }

                      if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelRename();
                      }
                    }}
                    className="border-none outline outline-white/10 bg-transparent text-xs ring-0 text-center w-[80%]"
                    aria-label={`Rename ${tab.title}`}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onChangeTab(tab.id)}
                    onDoubleClick={() => {
                      onChangeTab(tab.id);
                      setEditingTabId(tab.id);
                      setDraftTitle(tab.title);
                    }}
                    className="min-w-0 flex-1 truncate"
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={`Open ${tab.title}`}
                  >
                    <span className="truncate w-[80%] inline-flex justify-center items-center">{tab.title}</span>
                  </button>
                )}

                {canCloseTabs ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (isEditing) {
                        cancelRename();
                      }
                      onCloseTab(tab.id);
                    }}
                    className={cn(
                      'absolute right-1 flex size-5 items-center justify-center rounded transition-all hover:bg-muted',
                      isActive
                        ? 'opacity-0 group-hover/terminal-tab:opacity-60 group-hover/terminal-tab:hover:opacity-100'
                        : 'opacity-0 group-hover/terminal-tab:opacity-60 group-hover/terminal-tab:hover:opacity-100',
                    )}
                    aria-label={`Close ${tab.title}`}
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
            aria-label="New terminal tab"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </div>
      </div>

      <SessionTerminal key={activeTabId} sessionId={activeTabId} cwd={cwd} />
    </div>
  );
}
