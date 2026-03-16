import type { ReactNode } from 'react';

import { GithubIcon, MessageSquareIcon, RefreshCwIcon } from 'lucide-react';

import type { GitHubUserWithAvatar, ProjectFeed, ProjectFeedItemBase } from '@/ipc/contracts';
import { getAuthorLogin, getUniqueCommentAuthors } from '@/renderer/shared/lib/github-view';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@/shadcn/components/ui/avatar';
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
import { RelativeTime } from '@/renderer/shared/ui/relative-time';

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

function FeedCommentAuthors({
  count,
  authors,
}: {
  count: number;
  authors: GitHubUserWithAvatar[];
}) {
  if (count === 0) {
    return null;
  }

  const visible = authors.slice(0, VISIBLE_AUTHORS_LIMIT);
  const remaining = authors.length - VISIBLE_AUTHORS_LIMIT;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <MessageSquareIcon className="size-3" />
          <span className="text-xs">{count}</span>
          {visible.length > 0 && (
            <AvatarGroup>
              {visible.map((author) => (
                <Avatar key={author.login} size="sm" className="size-4">
                  <AvatarImage src={author.avatarUrl} alt={author.login} />
                  <AvatarFallback>{author.login[0]}</AvatarFallback>
                </Avatar>
              ))}
              {remaining > 0 && (
                <AvatarGroupCount className="size-4 text-[0.5rem]">
                  +{remaining}
                </AvatarGroupCount>
              )}
            </AvatarGroup>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {count} {count === 1 ? 'comment' : 'comments'}
        {authors.length > 0 && ` by ${authors.map((a) => a.login).join(', ')}`}
      </TooltipContent>
    </Tooltip>
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
  sublineAside,
  sublineExtra,
}: {
  item: TItem;
  title: ReactNode;
  leadingIcon?: ReactNode;
  sublineAside?: ReactNode;
  sublineExtra?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-3.5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-1.5">
          {leadingIcon}
          {title}
        </div>
        <FeedLabels labels={item.labels} />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {item.author?.avatarUrl && (
              <Avatar size="sm">
                <AvatarImage src={item.author.avatarUrl} alt="" />
                <AvatarFallback>{item.author.login[0]}</AvatarFallback>
              </Avatar>
            )}
            {getAuthorLogin(item.author)}
          </span>
          <RelativeTime value={item.createdAt} />
          {sublineExtra}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <FeedCommentAuthors
            count={item.commentCount}
            authors={getUniqueCommentAuthors(item.commentAuthors)}
          />
          {sublineAside}
        </div>
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
      <div className="flex items-center justify-center py-16">
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
