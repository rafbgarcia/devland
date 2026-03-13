import type { ReactNode } from 'react';

import { GithubIcon, MoreHorizontalIcon, RefreshCwIcon } from 'lucide-react';

import type { ProjectFeed, ProjectFeedItemBase } from '@/ipc/contracts';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Badge } from '@/shadcn/components/ui/badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import { Separator } from '@/shadcn/components/ui/separator';
import { Spinner } from '@/shadcn/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shadcn/components/ui/tooltip';
import { cn } from '@/shadcn/lib/utils';
import { RelativeTime } from '@/ui/relative-time';

const VISIBLE_AUTHORS_LIMIT = 3;

export type ProjectFeedStatus<TFeed extends ProjectFeed> =
  | {
      status: 'loading';
      data: null;
      error: null;
    }
  | {
      status: 'ready';
      data: TFeed;
      error: null;
    }
  | {
      status: 'error';
      data: null;
      error: string;
    };

export type ProjectFeedDefinition<TFeed extends ProjectFeed> = {
  loadingMessage: string;
  emptyState: {
    icon: ReactNode;
    title: string;
    description: string;
  };
  labels: {
    refresh: string;
    list: string;
  };
  renderItem: (item: TFeed['items'][number]) => ReactNode;
};

function FeedCommentCount({ count, authors }: { count: number; authors: string[] }) {
  if (count === 0) {
    return <span>0 comments</span>;
  }

  const visible = authors.slice(0, VISIBLE_AUTHORS_LIMIT);
  const remaining = authors.slice(VISIBLE_AUTHORS_LIMIT);

  return (
    <span className="inline-flex items-center gap-1">
      <span>
        {count} {count === 1 ? 'comment' : 'comments'}
        {visible.length > 0 ? ` by ${visible.join(', ')}` : ''}
      </span>
      {remaining.length > 0 ? (
        <Tooltip>
          <TooltipTrigger
            className="inline-flex cursor-default items-center rounded-full bg-muted px-1 py-px text-[0.6rem] font-medium text-muted-foreground"
          >
            <MoreHorizontalIcon className="mr-0.5 size-2.5" />
            +{remaining.length}
          </TooltipTrigger>
          <TooltipContent>{remaining.join(', ')}</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}

function FeedLabels({ labels }: { labels: Array<{ name: string; color: string }> }) {
  if (labels.length === 0) {
    return null;
  }

  return (
    <span className="inline-flex flex-wrap gap-1">
      {labels.map((label) => (
        <Badge
          key={label.name}
          variant="outline"
          className="px-2 py-0.5 text-[0.65rem]"
          style={{
            backgroundColor: `#${label.color}20`,
            color: `#${label.color}`,
            border: `1px solid #${label.color}40`,
          }}
        >
          {label.name}
        </Badge>
      ))}
    </span>
  );
}

export function ProjectFeedHeader({
  itemCount,
  fetchedAt,
  isRefetching,
  onRefetch,
  refreshLabel,
}: {
  itemCount: number;
  fetchedAt: number;
  isRefetching: boolean;
  onRefetch: () => void;
  refreshLabel: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {itemCount} open
      {' · '}
      refreshed <RelativeTime value={fetchedAt} />
      <button
        className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        disabled={isRefetching}
        onClick={onRefetch}
        title={`Refresh ${refreshLabel}`}
        type="button"
      >
        <RefreshCwIcon className={cn('size-3', isRefetching && 'animate-spin')} />
      </button>
    </span>
  );
}

export function ProjectFeedItemFrame<TItem extends ProjectFeedItemBase>({
  item,
  title,
  leadingIcon,
  aside,
}: {
  item: TItem;
  title: ReactNode;
  leadingIcon?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          {leadingIcon}
          {title}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{item.authorLogin}</span>
          <RelativeTime value={item.createdAt} />
          <span className="text-border">|</span>
          <FeedCommentCount count={item.commentCount} authors={item.commentAuthors} />
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <FeedLabels labels={item.labels} />
        {aside}
      </div>
    </div>
  );
}

export function ProjectFeedScaffold<TFeed extends ProjectFeed>({
  state,
  isRefetching,
  onRefetch,
  definition,
}: {
  state: ProjectFeedStatus<TFeed>;
  isRefetching: boolean;
  onRefetch: () => void;
  definition: ProjectFeedDefinition<TFeed>;
}) {
  if (state.status === 'loading') {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner />
          {definition.loadingMessage}
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="p-5">
        <Alert variant="destructive">
          <GithubIcon />
          <AlertTitle>Could not load project data</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (state.data.items.length === 0) {
    return (
      <div className="px-6 py-16">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">{definition.emptyState.icon}</EmptyMedia>
            <EmptyTitle>{definition.emptyState.title}</EmptyTitle>
            <EmptyDescription>{definition.emptyState.description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="text-sm text-muted-foreground">
          Showing {state.data.items.length} {definition.labels.list}
        </span>
        <ProjectFeedHeader
          itemCount={state.data.items.length}
          fetchedAt={state.data.fetchedAt}
          isRefetching={isRefetching}
          onRefetch={onRefetch}
          refreshLabel={definition.labels.refresh}
        />
      </div>

      {state.data.items.map((item, index) => (
        <div key={item.id}>
          {definition.renderItem(item)}
          {index < state.data.items.length - 1 ? <Separator /> : null}
        </div>
      ))}
    </div>
  );
}
