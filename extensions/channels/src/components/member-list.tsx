import { members, getMemberColor, type Member } from '@/data/dummy';
import { cn } from '@/lib/utils';

export function MemberList() {
  const online = members.filter((m) => m.status !== 'offline');
  const offline = members.filter((m) => m.status === 'offline');

  return (
    <div className="flex w-[240px] shrink-0 flex-col overflow-y-auto border-l border-border bg-secondary">
      <div className="p-4 pt-6">
        <MemberGroup label="Online" count={online.length} members={online} />
        <MemberGroup label="Offline" count={offline.length} members={offline} />
      </div>
    </div>
  );
}

function MemberGroup({ label, count, members: groupMembers }: { label: string; count: number; members: Member[] }) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between px-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
      </div>
      <div className="space-y-0.5">
        {groupMembers.map((member) => (
          <MemberItem key={member.id} member={member} />
        ))}
      </div>
    </div>
  );
}

function MemberItem({ member }: { member: Member }) {
  const isOffline = member.status === 'offline';
  const color = getMemberColor(member.id);

  const statusStyles = {
    online: 'bg-green-500',
    idle: 'bg-yellow-500',
    dnd: 'bg-destructive',
    offline: 'bg-muted-foreground',
  } as const;

  return (
    <div
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/50',
        isOffline && 'opacity-50',
      )}
    >
      {/* Avatar with colored ring */}
      <div className="relative shrink-0">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold ring-2 ring-offset-1 ring-offset-secondary"
          style={{
            background: color + '18',
            color: isOffline ? 'var(--muted-foreground)' : color,
            // @ts-expect-error -- Tailwind ring-color via CSS custom prop
            '--tw-ring-color': isOffline ? 'transparent' : color + '40',
          }}
        >
          {member.avatar}
        </div>
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-secondary',
            statusStyles[member.status],
          )}
        />
      </div>

      {/* Name, role, activity */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn('truncate text-[13px] font-medium', isOffline ? 'text-muted-foreground' : 'text-foreground')}>
            {member.name}
          </span>
          {member.role === 'admin' && (
            <span className="shrink-0 rounded bg-primary/20 px-1 py-px text-[9px] font-semibold uppercase text-primary">
              Admin
            </span>
          )}
        </div>
        {member.activity && (
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            {member.activity}
          </p>
        )}
      </div>
    </div>
  );
}
