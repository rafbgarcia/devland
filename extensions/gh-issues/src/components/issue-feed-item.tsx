import { InvestigateButton } from '@/components/investigate-button';
import { ProjectFeedItemFrame } from '@/components/project-feed';
import { cn } from '@/lib/utils';
import type { ProjectIssueFeedItem } from '@/types/issues';

export function IssueFeedItem({
  item,
  slug,
  isSelected,
  onSelect,
}: {
  item: ProjectIssueFeedItem;
  slug: string;
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
        'group/row w-full text-left transition-colors hover:bg-muted/50 cursor-default',
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
        titleAside={
          <InvestigateButton slug={slug} issueNumber={item.number} />
        }
      />
    </div>
  );
}
