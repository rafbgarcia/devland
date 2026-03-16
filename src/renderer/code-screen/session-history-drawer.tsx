import { useEffect, useMemo, useState } from 'react';

import { HistoryIcon } from 'lucide-react';

import { dayjs } from '@/lib/dayjs';
import type { CodexChatMessage } from '@/renderer/code-screen/codex-session-state';
import { SlidingDetailDrawer } from '@/renderer/shared/ui/sliding-detail-drawer';
import { Badge } from '@/shadcn/components/ui/badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import { cn } from '@/shadcn/lib/utils';

type SessionHistoryEntry = {
  id: string;
  createdAt: string;
  prompt: CodexChatMessage | null;
  response: CodexChatMessage;
};

function buildSessionHistoryEntries(messages: CodexChatMessage[]): SessionHistoryEntry[] {
  const entries: SessionHistoryEntry[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];

    if (!message || message.role !== 'assistant') {
      continue;
    }

    const prompt = index > 0 ? messages[index - 1] ?? null : null;

    entries.push({
      id: message.id,
      createdAt: message.createdAt,
      prompt: prompt?.role === 'user' ? prompt : null,
      response: message,
    });
  }

  return entries;
}

export function SessionHistoryDrawer({
  open,
  onClose,
  messages,
}: {
  open: boolean;
  onClose: () => void;
  messages: CodexChatMessage[];
}) {
  const entries = useMemo(() => buildSessionHistoryEntries(messages), [messages]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedEntryId((current) => current ?? entries.at(-1)?.id ?? null);
  }, [entries, open]);

  const selectedEntry =
    entries.find((entry) => entry.id === selectedEntryId) ?? entries.at(-1) ?? null;

  return (
    <SlidingDetailDrawer open={open} onClose={onClose}>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[22rem] shrink-0 flex-col border-r border-border bg-card/40">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <HistoryIcon className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Session history</p>
                <p className="text-xs text-muted-foreground">
                  Completed turns for this target
                </p>
              </div>
            </div>
          </div>

          {entries.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center px-4">
              <Empty className="border-border/70 bg-background/50">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HistoryIcon />
                  </EmptyMedia>
                  <EmptyTitle>No turns yet</EmptyTitle>
                  <EmptyDescription>
                    Send a prompt to start building session history.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <div className="flex flex-col gap-2">
                {entries.toReversed().map((entry) => {
                  const changedFileCount = entry.response.diff?.files.length ?? 0;

                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedEntryId(entry.id)}
                      className={cn(
                        'rounded-2xl border px-3 py-3 text-left transition-colors',
                        selectedEntry?.id === entry.id
                          ? 'border-primary/40 bg-primary/8'
                          : 'border-border bg-background/70 hover:bg-background',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {changedFileCount > 0 ? `${changedFileCount} files` : 'No diff'}
                        </Badge>
                        <p className="text-xs text-muted-foreground">
                          {dayjs(entry.createdAt).fromNow()}
                        </p>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">
                        {entry.prompt?.text.trim() || 'Assistant turn'}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {entry.response.text.trim() || '(empty response)'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {selectedEntry ? (
            <div className="flex min-h-full flex-col gap-6 px-6 py-5">
              <div className="flex flex-col gap-2">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Prompt
                </p>
                <div className="rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm whitespace-pre-wrap text-foreground">
                  {selectedEntry.prompt?.text.trim() || 'No prompt recorded.'}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Response
                </p>
                <div className="rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm whitespace-pre-wrap text-foreground">
                  {selectedEntry.response.text.trim() || '(empty response)'}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    Turn diff
                  </p>
                  <Badge variant="outline">
                    {selectedEntry.response.diff?.files.length ?? 0} files
                  </Badge>
                </div>

                {selectedEntry.response.diff && selectedEntry.response.diff.files.length > 0 ? (
                  <>
                    <div className="flex flex-col gap-2">
                      {selectedEntry.response.diff.files.map((file) => (
                        <div
                          key={`${file.status}:${file.path}`}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{file.path}</p>
                            <p className="text-muted-foreground">{file.status}</p>
                          </div>
                          <p className="shrink-0 text-muted-foreground">
                            +{file.additions} / -{file.deletions}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-border bg-card/70">
                      <div className="border-b border-border px-4 py-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        Patch
                      </div>
                      <pre className="overflow-x-auto px-4 py-3 font-mono text-[12px] leading-6 text-foreground">
                        {selectedEntry.response.diff.patch}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
                    This turn did not record workspace changes.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6">
              <p className="text-sm text-muted-foreground">Select a turn to inspect.</p>
            </div>
          )}
        </div>
      </div>
    </SlidingDetailDrawer>
  );
}
