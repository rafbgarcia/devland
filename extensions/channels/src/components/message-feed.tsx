import { useRef, useEffect } from 'react';
import { Hash, Circle } from 'lucide-react';

import { messages, channels, getMember, getMemberColor } from '@/data/dummy';

type MessageFeedProps = {
  activeChannelId: string;
};

export function MessageFeed({ activeChannelId }: MessageFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const channel = channels.find((c) => c.id === activeChannelId);
  const channelMessages = messages.filter((m) => m.channelId === activeChannelId);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeChannelId]);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-background">
      {/* Channel header */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <Hash size={20} className="text-muted-foreground" />
        <h2 className="text-[15px] font-semibold text-foreground">
          {channel?.name ?? 'unknown'}
        </h2>
        <div className="mx-2 h-6 w-px bg-border" />
        <span className="truncate text-[13px] text-muted-foreground">
          {getChannelDescription(activeChannelId)}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex flex-col pb-6">
          {/* Channel welcome */}
          <div className="px-4 pb-4 pt-16">
            <div className="mb-2 flex h-[68px] w-[68px] items-center justify-center rounded-full bg-secondary">
              <Hash size={36} className="text-foreground" />
            </div>
            <h3 className="text-[30px] font-bold leading-tight text-foreground">
              Welcome to #{channel?.name}
            </h3>
            <p className="mt-1 text-[14px] text-muted-foreground">
              This is the start of the #{channel?.name} channel.
            </p>
          </div>

          <div className="mx-4 mb-4 h-px bg-border" />

          {/* Message groups */}
          {groupMessages(channelMessages).map((group) => {
            const author = getMember(group.authorId);
            if (!author) return null;
            const color = getMemberColor(group.authorId);

            return (
              <div
                key={group.messages[0]!.id}
                className="group relative px-4 py-3 transition-colors hover:bg-accent/30"
              >
                <div className="flex gap-4">
                  {/* Avatar */}
                  <div
                    className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{ background: color + '22', color }}
                  >
                    {author.avatar}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[15px] font-medium" style={{ color }}>
                        {author.name}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatTimestamp(group.messages[0]!.timestamp)}
                      </span>
                    </div>

                    {group.messages.map((msg) => (
                      <p
                        key={msg.id}
                        className="text-[15px] leading-[1.375rem] text-foreground"
                      >
                        {msg.content}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Message input */}
      <div className="shrink-0 px-4 pb-6">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5">
          <button className="shrink-0 rounded text-muted-foreground transition-colors hover:text-foreground">
            <Circle size={20} />
          </button>
          <div className="flex-1 text-[15px] text-muted-foreground">
            Message #{channel?.name}
          </div>
        </div>
      </div>
    </div>
  );
}

function getChannelDescription(channelId: string): string {
  const descriptions: Record<string, string> = {
    general: 'General discussion for the team',
    engineering: 'Engineering updates, PRs, and technical discussions',
    design: 'Design system, mockups, and visual feedback',
    random: 'Off-topic conversations and fun stuff',
    announcements: 'Important team announcements',
    rules: 'Community guidelines',
    standups: 'Daily async standups',
    launches: 'Launch coordination and go-live updates',
  };
  return descriptions[channelId] ?? '';
}

type MessageGroup = {
  authorId: string;
  messages: { id: string; content: string; timestamp: string }[];
};

function groupMessages(msgs: typeof messages): MessageGroup[] {
  const groups: MessageGroup[] = [];

  for (const msg of msgs) {
    const last = groups[groups.length - 1];
    if (last && last.authorId === msg.authorId) {
      last.messages.push(msg);
    } else {
      groups.push({
        authorId: msg.authorId,
        messages: [msg],
      });
    }
  }

  return groups;
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `Today at ${displayHours}:${minutes} ${period}`;
}
