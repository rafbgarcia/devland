import {
  GitPullRequestArrowIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
} from 'lucide-react';

import type { ProjectPullRequestFeed, ProjectPullRequestFeedItem } from '@/ipc/contracts';
import {
  ProjectFeedItemFrame,
  ProjectFeedScaffold,
  type ProjectFeedDefinition,
} from '@/renderer/components/project-workspace-feed';
import { useProjectPullRequests } from '@/renderer/hooks/use-project-prs';

function PullRequestDiffStats({
  commitCount,
  additions,
  deletions,
}: {
  commitCount: number;
  additions: number;
  deletions: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
      <span>{commitCount} {commitCount === 1 ? 'commit' : 'commits'}</span>
      <span className="text-green-600">+{additions.toLocaleString()}</span>
      <span className="text-red-500">-{deletions.toLocaleString()}</span>
    </span>
  );
}

function PullRequestFeedItem({ item }: { item: ProjectPullRequestFeedItem }) {
  return (
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
        <a
          className="truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
          href={item.url}
          rel="noreferrer"
          target="_blank"
        >
          {item.title}{' '}
          <span className="font-normal text-muted-foreground">(#{item.number})</span>
        </a>
      }
      aside={
        <PullRequestDiffStats
          commitCount={item.commitCount}
          additions={item.additions}
          deletions={item.deletions}
        />
      }
    />
  );
}

const pullRequestFeedDefinition: ProjectFeedDefinition<ProjectPullRequestFeed> = {
  loadingMessage: 'Fetching pull requests from GitHub',
  emptyState: {
    icon: <GitPullRequestArrowIcon />,
    title: 'No open pull requests',
    description: 'This project has no open pull requests right now.',
  },
  labels: {
    refresh: 'pull requests',
    list: 'pull requests',
  },
  renderItem: (item) => <PullRequestFeedItem item={item} />,
};

export function ProjectPullRequestsFeed() {
  const { refetch, isRefetching, ...feedState } = useProjectPullRequests();

  return (
    <ProjectFeedScaffold
      state={feedState}
      isRefetching={isRefetching}
      onRefetch={refetch}
      definition={pullRequestFeedDefinition}
    />
  );
}
