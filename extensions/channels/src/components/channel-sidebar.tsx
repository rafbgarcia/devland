import { useState } from 'react';
import { Hash, ChevronDown, ChevronRight, Plus, Settings } from 'lucide-react';

import { channels, type Channel } from '@/data/dummy';
import { cn } from '@/lib/utils';

type ChannelSidebarProps = {
  activeChannelId: string;
  onChannelSelect: (id: string) => void;
};

export function ChannelSidebar({ activeChannelId, onChannelSelect }: ChannelSidebarProps) {
  const categories = Array.from(new Set(channels.map((c) => c.category)));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCategory = (category: string) => {
    setCollapsed((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  return (
    <div className="flex w-[240px] shrink-0 flex-col border-r border-border bg-secondary">
      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-2 pt-3">
        {categories.map((category) => {
          const categoryChannels = channels.filter((c) => c.category === category);
          const isCollapsed = collapsed[category] === true;

          return (
            <div key={category} className="mb-1">
              <button
                onClick={() => toggleCategory(category)}
                className="group mb-0.5 flex w-full items-center gap-0.5 px-1 py-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
              >
                {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                <span>{category}</span>
                <Plus
                  size={14}
                  className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>

              {!isCollapsed &&
                categoryChannels.map((channel) => (
                  <ChannelItem
                    key={channel.id}
                    channel={channel}
                    isActive={channel.id === activeChannelId}
                    onSelect={() => onChannelSelect(channel.id)}
                  />
                ))}
            </div>
          );
        })}
      </div>

      {/* User panel */}
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-t border-border bg-background px-2">
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          YO
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-background bg-green-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-foreground">You</div>
          <div className="truncate text-[11px] text-muted-foreground">Online</div>
        </div>
        <button className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground">
          <Settings size={16} />
        </button>
      </div>
    </div>
  );
}

function ChannelItem({
  channel,
  isActive,
  onSelect,
}: {
  channel: Channel;
  isActive: boolean;
  onSelect: () => void;
}) {
  const hasUnread = channel.unreadCount !== undefined && channel.unreadCount > 0;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'group flex w-full items-center gap-1.5 rounded-md px-2 py-[6px] text-left transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        hasUnread && !isActive && 'text-foreground',
      )}
    >
      <Hash size={18} className="shrink-0 opacity-70" />
      <span
        className={cn('flex-1 truncate text-[15px] leading-5', hasUnread && !isActive && 'font-semibold')}
      >
        {channel.name}
      </span>
      {hasUnread && !isActive && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold leading-none text-white">
          {channel.unreadCount}
        </span>
      )}
    </button>
  );
}
