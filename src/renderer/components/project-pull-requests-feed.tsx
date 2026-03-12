import {
  GitPullRequestArrowIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
} from 'lucide-react';

import type { ProjectPullRequestFeedItem } from '@/ipc/contracts';
import { useProjectFeed } from '@/renderer/hooks/use-project-feed';
import { ProjectFeedItemFrame, ProjectFeedScaffold } from '@/renderer/components/project-workspace-feed';

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

export function ProjectPullRequestsFeed({ projectPath }: { projectPath: string }) {
  const { refetch, isRefetching, ...feedState } = useProjectFeed(
    projectPath,
    'pull-requests',
  );

  return (
    <ProjectFeedScaffold
      state={feedState}
      isRefetching={isRefetching}
      onRefetch={refetch}
      loadingMessage="Fetching pull requests from GitHub"
      emptyIcon={<GitPullRequestArrowIcon />}
      emptyTitle="No open pull requests"
      emptyDescription="This project has no open pull requests right now."
      refreshLabel="pull requests"
      listLabel="pull requests"
      renderItem={(item) => <PullRequestFeedItem item={item} />}
    />
  );
}
