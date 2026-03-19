import type { ProjectIssueFeedItem } from '@/ipc/contracts';
import { ProjectFeedItemFrame } from '@/renderer/shared/ui/project-feed/project-feed';
import { cn } from '@/shadcn/lib/utils';

export function IssueFeedItem({
  item,
  isSelected,
  onSelect,
}: {
  item: ProjectIssueFeedItem;
  isSelected: boolean;
  onSelect: (item: ProjectIssueFeedItem) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(item);
        }
      }}
      className={cn(
        'w-full text-left transition-colors hover:bg-muted/50',
        isSelected && 'bg-muted',
      )}
    >
      <ProjectFeedItemFrame
        item={item}
        title={
          <span className="truncate text-sm font-medium text-foreground">
            {item.title}{' '}
            <span className="font-normal text-muted-foreground">(#{item.number})</span>
          </span>
        }
      />
    </div>
  );
}
