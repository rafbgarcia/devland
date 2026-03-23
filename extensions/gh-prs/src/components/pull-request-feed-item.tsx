import {
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
} from 'lucide-react';

import { ProjectFeedItemFrame } from '@/components/project-feed';
import { cn } from '@/lib/utils';
import type { ProjectPullRequestFeedItem } from '@/types/pull-requests';

import { PullRequestDiffStats } from './pull-request-diff-stats';

export function PullRequestFeedItem({
  item,
  isSelected,
  onSelect,
  onReview,
}: {
  item: ProjectPullRequestFeedItem;
  isSelected: boolean;
  onSelect: (item: ProjectPullRequestFeedItem) => void;
  onReview: (item: ProjectPullRequestFeedItem) => void;
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
        'group/pr w-full text-left transition-colors hover:bg-muted/50 cursor-default',
        isSelected && 'bg-muted',
      )}
    >
      <ProjectFeedItemFrame
        item={item}
        leadingIcon={
          item.isDraft ? (
            <GitPullRequestDraftIcon className="size-3 shrink-0 text-gray-500" />
          ) : (
            <GitPullRequestIcon className="size-3 shrink-0 text-green-800" />
          )
        }
        title={
          <span className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
            <span className="truncate">
              {item.title}{' '}
              <span className="font-normal text-muted-foreground">(#{item.number})</span>
            </span>
          </span>
        }
        actions={(
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onReview(item);
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
            className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/8 hover:text-primary"
          >
            Prompt session
          </button>
        )}
        sublineAside={
          <PullRequestDiffStats
            commitCount={item.commitCount}
            additions={item.additions}
            deletions={item.deletions}
          />
        }
      />
    </div>
  );
}
