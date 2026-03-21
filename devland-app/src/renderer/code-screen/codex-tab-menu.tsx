import { useEffect, useMemo, useState } from 'react';

import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
  PlusIcon,
  ShieldCheckIcon,
  ZapIcon,
} from 'lucide-react';

import { dayjs } from '@/lib/dayjs';
import {
  CODEX_MODEL_OPTIONS,
  CODEX_REASONING_EFFORTS,
  type CodexComposerSettings,
  codexInteractionModeLabel,
  codexReasoningEffortLabel,
} from '@/lib/codex-chat';
import type { CodexThreadSummary } from '@/ipc/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRadioItemIndicator,
  DropdownMenuSeparator,
  DropdownMenuSubmenu,
  DropdownMenuSubmenuTrigger,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';
import { cn } from '@/shadcn/lib/utils';

type TimeGroup = {
  label: string;
  entries: CodexThreadSummary[];
};

function groupEntriesByTime(entries: CodexThreadSummary[]): TimeGroup[] {
  const now = dayjs();
  const todayStart = now.startOf('day').unix();
  const yesterdayStart = now.subtract(1, 'day').startOf('day').unix();
  const weekStart = now.subtract(7, 'day').startOf('day').unix();

  const groups: Record<string, CodexThreadSummary[]> = {
    Today: [],
    Yesterday: [],
    'This week': [],
    Earlier: [],
  };

  for (const entry of entries) {
    if (entry.updatedAt >= todayStart) {
      groups['Today']!.push(entry);
    } else if (entry.updatedAt >= yesterdayStart) {
      groups['Yesterday']!.push(entry);
    } else if (entry.updatedAt >= weekStart) {
      groups['This week']!.push(entry);
    } else {
      groups['Earlier']!.push(entry);
    }
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, entries: items }));
}

function ThreadsSubmenu({
  cwd,
  currentThreadId,
  onSelectThread,
}: {
  cwd: string;
  currentThreadId: string | null;
  onSelectThread: (threadId: string) => Promise<void>;
}) {
  const [entries, setEntries] = useState<CodexThreadSummary[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    void window.electronAPI
      .listCodexThreads({ cwd, limit: 24 })
      .then((nextEntries) => {
        if (!cancelled) {
          setEntries(nextEntries);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const sortedEntries = useMemo(
    () => entries.toSorted((left, right) => right.updatedAt - left.updatedAt),
    [entries],
  );

  const timeGroups = useMemo(() => groupEntriesByTime(sortedEntries), [sortedEntries]);

  return (
    <DropdownMenuContent
      side="right"
      sideOffset={2}
      align="start"
      className="max-h-[22rem] w-[18rem] overflow-y-auto p-0"
    >
      {status === 'loading' ? (
        <div className="flex items-center justify-center py-6">
          <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground" />
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="px-3 py-4 text-xs text-destructive/70">Failed to load threads.</div>
      ) : null}
      {status === 'ready' && sortedEntries.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">No threads yet</div>
      ) : null}
      {status === 'ready' && timeGroups.length > 0 ? (
        <div className="flex flex-col">
          {timeGroups.map((group, groupIndex) => (
            <div key={group.label}>
              {groupIndex > 0 ? <div className="mx-3 border-t border-border/50" /> : null}
              <div className="px-3 pb-1 pt-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                  {group.label}
                </p>
              </div>
              <div className="flex flex-col gap-px px-1.5 pb-1.5">
                {group.entries.map((entry) => {
                  const title = entry.name?.trim() || entry.preview.trim() || 'Untitled';
                  const preview = entry.name?.trim() ? entry.preview.trim() : '';
                  const isCurrent = currentThreadId === entry.id;
                  const isPending = pendingThreadId === entry.id;

                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        if (isCurrent || isPending) return;
                        setPendingThreadId(entry.id);
                        void onSelectThread(entry.id).finally(() => {
                          setPendingThreadId((c) => (c === entry.id ? null : c));
                        });
                      }}
                      className={cn(
                        'group relative w-full rounded-md px-2.5 py-1.5 text-left transition-colors',
                        isCurrent
                          ? 'bg-primary/10 ring-1 ring-primary/20'
                          : 'hover:bg-muted/50',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <p
                          className={cn(
                            'min-w-0 flex-1 truncate text-xs',
                            isCurrent
                              ? 'font-medium text-primary'
                              : 'text-foreground/80 group-hover:text-foreground',
                          )}
                        >
                          {title}
                        </p>
                        {isPending ? (
                          <LoaderCircleIcon className="size-2.5 shrink-0 animate-spin text-muted-foreground" />
                        ) : null}
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/40">
                          {dayjs.unix(entry.updatedAt).fromNow(true)}
                        </span>
                      </div>
                      {preview ? (
                        <p className="mt-0.5 truncate text-[10px] leading-relaxed text-muted-foreground/40">
                          {preview}
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </DropdownMenuContent>
  );
}

export function CodexTabMenu({
  cwd,
  currentThreadId,
  settings,
  onSettingsChange,
  onNewSession,
  onSelectThread,
}: {
  cwd: string;
  currentThreadId: string | null;
  settings: CodexComposerSettings;
  onSettingsChange: (settings: CodexComposerSettings) => void;
  onNewSession: () => void;
  onSelectThread: (threadId: string) => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-6 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground"
        aria-label="Codex menu"
        onClick={(e) => e.stopPropagation()}
      >
        <ChevronDownIcon className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" sideOffset={6} align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onNewSession}>
            <PlusIcon className="size-3.5" />
            New session
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuSubmenu>
            <DropdownMenuSubmenuTrigger>
              Threads
              <ChevronRightIcon className="ml-auto size-3.5 text-muted-foreground" />
            </DropdownMenuSubmenuTrigger>
            <ThreadsSubmenu
              cwd={cwd}
              currentThreadId={currentThreadId}
              onSelectThread={onSelectThread}
            />
          </DropdownMenuSubmenu>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>Mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={settings.interactionMode}
            onValueChange={(interactionMode) => {
              if (!interactionMode || interactionMode === settings.interactionMode) return;
              onSettingsChange({
                ...settings,
                interactionMode: interactionMode as CodexComposerSettings['interactionMode'],
              });
            }}
          >
            {['default', 'plan'].map((interactionMode) => (
              <DropdownMenuRadioItem
                key={interactionMode}
                value={interactionMode}
                closeOnClick={false}
              >
                {codexInteractionModeLabel(
                  interactionMode as CodexComposerSettings['interactionMode'],
                )}
                <DropdownMenuRadioItemIndicator className="ml-auto">
                  <CheckIcon className="size-3.5" />
                </DropdownMenuRadioItemIndicator>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>Model</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={settings.model}
            onValueChange={(model) => {
              if (!model || model === settings.model) return;
              onSettingsChange({ ...settings, model });
            }}
          >
            {CODEX_MODEL_OPTIONS.map((modelOption) => (
              <DropdownMenuRadioItem
                key={modelOption.value}
                value={modelOption.value}
                closeOnClick={false}
              >
                <ZapIcon className="size-3.5 text-amber-400" />
                {modelOption.label}
                <DropdownMenuRadioItemIndicator className="ml-auto">
                  <CheckIcon className="size-3.5" />
                </DropdownMenuRadioItemIndicator>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>Reasoning</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={settings.reasoningEffort}
            onValueChange={(reasoningEffort) => {
              if (!reasoningEffort || reasoningEffort === settings.reasoningEffort) return;
              onSettingsChange({
                ...settings,
                reasoningEffort: reasoningEffort as CodexComposerSettings['reasoningEffort'],
              });
            }}
          >
            {CODEX_REASONING_EFFORTS.map((effort) => (
              <DropdownMenuRadioItem key={effort} value={effort} closeOnClick={false}>
                {codexReasoningEffortLabel(effort)}
                <DropdownMenuRadioItemIndicator className="ml-auto">
                  <CheckIcon className="size-3.5" />
                </DropdownMenuRadioItemIndicator>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>Fast mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={settings.fastMode ? 'on' : 'off'}
            onValueChange={(value) => {
              onSettingsChange({ ...settings, fastMode: value === 'on' });
            }}
          >
            {['off', 'on'].map((value) => (
              <DropdownMenuRadioItem key={value} value={value} closeOnClick={false}>
                {value}
                <DropdownMenuRadioItemIndicator className="ml-auto">
                  <CheckIcon className="size-3.5" />
                </DropdownMenuRadioItemIndicator>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>Access</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={settings.runtimeMode}
            onValueChange={(runtimeMode) => {
              if (!runtimeMode || runtimeMode === settings.runtimeMode) return;
              onSettingsChange({
                ...settings,
                runtimeMode: runtimeMode as CodexComposerSettings['runtimeMode'],
              });
            }}
          >
            <DropdownMenuRadioItem value="approval-required" closeOnClick={false}>
              <ShieldCheckIcon className="size-3.5" />
              Supervised
              <DropdownMenuRadioItemIndicator className="ml-auto">
                <CheckIcon className="size-3.5" />
              </DropdownMenuRadioItemIndicator>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="full-access" closeOnClick={false}>
              <ShieldCheckIcon className="size-3.5" />
              Full access
              <DropdownMenuRadioItemIndicator className="ml-auto">
                <CheckIcon className="size-3.5" />
              </DropdownMenuRadioItemIndicator>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
