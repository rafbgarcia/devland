import { useMemo } from 'react';

import { HistoryIcon } from 'lucide-react';

import { dayjs } from '@/lib/dayjs';
import { summarizeCodexUserMessage } from '@/lib/codex-chat';
import type { CodexChatMessage } from '@/renderer/code-screen/codex-session-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shadcn/components/ui/dropdown-menu';
import { cn } from '@/shadcn/lib/utils';

type HistoryEntry = {
  id: string;
  createdAt: string;
  promptText: string;
  additions: number;
  deletions: number;
  hasDiff: boolean;
};

function buildHistoryEntries(messages: CodexChatMessage[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  const indexByTurnKey = new Map<string, number>();

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];

    if (!message || message.role !== 'assistant') {
      continue;
    }

    const prompt = messages.findLast(
      (candidate, candidateIndex) =>
        candidateIndex < i &&
        candidate.role === 'user' &&
        (message.turnId === null || candidate.turnId === message.turnId),
    ) ?? null;

    const turnKey = message.turnId ?? message.id;
    const existing = indexByTurnKey.get(turnKey);

    if (existing !== undefined) {
      const entry = entries[existing];

      if (entry && message.diff) {
        entries[existing] = {
          ...entry,
          additions: message.diff.files.reduce((sum, f) => sum + f.additions, 0),
          deletions: message.diff.files.reduce((sum, f) => sum + f.deletions, 0),
          hasDiff: true,
        };
      }

      continue;
    }

    const additions = message.diff?.files.reduce((sum, f) => sum + f.additions, 0) ?? 0;
    const deletions = message.diff?.files.reduce((sum, f) => sum + f.deletions, 0) ?? 0;

    entries.push({
      id: turnKey,
      createdAt: message.createdAt,
      promptText:
        prompt
          ? summarizeCodexUserMessage({
              text: prompt.text,
              attachments: prompt.attachments,
            })
          : 'Assistant turn',
      additions,
      deletions,
      hasDiff: !!message.diff && message.diff.files.length > 0,
    });
    indexByTurnKey.set(turnKey, entries.length - 1);
  }

  return entries;
}

export function SessionHistoryDropdown({
  messages,
  disabled,
}: {
  messages: CodexChatMessage[];
  disabled?: boolean;
}) {
  const entries = useMemo(() => buildHistoryEntries(messages), [messages]);
  const reversedEntries = useMemo(() => entries.toReversed(), [entries]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(
          'flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          'disabled:pointer-events-none disabled:opacity-40',
        )}
        aria-label="Session history"
      >
        <HistoryIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        sideOffset={8}
        align="start"
        className="max-h-[24rem] w-[22rem] overflow-y-auto"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Session history</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {reversedEntries.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-muted-foreground">
            No turns yet
          </div>
        ) : (
          <DropdownMenuGroup>
            {reversedEntries.map((entry) => (
              <DropdownMenuItem key={entry.id} className="flex items-center gap-3 px-2.5 py-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium">
                  {entry.promptText}
                </p>
                {entry.hasDiff ? (
                  <span className="shrink-0 text-xs tabular-nums">
                    <span className="text-emerald-400">+{entry.additions}</span>
                    {' '}
                    <span className="text-red-400">-{entry.deletions}</span>
                  </span>
                ) : null}
                <span className="shrink-0 text-xs text-muted-foreground">
                  {dayjs(entry.createdAt).fromNow(true)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
