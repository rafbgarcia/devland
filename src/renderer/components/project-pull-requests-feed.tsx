import { useState } from 'react';

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
import { cn } from '@/shadcn/lib/utils';

import { PullRequestDetailDrawer } from './pull-request-detail-drawer';

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

function PullRequestFeedItem({
  item,
  isSelected,
  onSelect,
}: {
  item: ProjectPullRequestFeedItem;
  isSelected: boolean;
  onSelect: (item: ProjectPullRequestFeedItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={cn(
        'w-full text-left transition-colors hover:bg-muted/50',
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
          <span className="truncate text-sm font-medium text-foreground">
            {item.title}{' '}
            <span className="font-normal text-muted-foreground">(#{item.number})</span>
          </span>
        }
        aside={
          <PullRequestDiffStats
            commitCount={item.commitCount}
            additions={item.additions}
            deletions={item.deletions}
          />
        }
      />
    </button>
  );
}

export function ProjectPullRequestsFeed() {
  const { refetch, isRefetching, ...feedState } = useProjectPullRequests();
  const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(null);

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
    renderItem: (item) => (
      <PullRequestFeedItem
        item={item}
        isSelected={item.number === selectedPrNumber}
        onSelect={(i) => setSelectedPrNumber(i.number)}
      />
    ),
  };

  return (
    <>
      <ProjectFeedScaffold
        state={feedState}
        isRefetching={isRefetching}
        onRefetch={refetch}
        definition={pullRequestFeedDefinition}
      />
      <PullRequestDetailDrawer
        prNumber={selectedPrNumber}
        onClose={() => setSelectedPrNumber(null)}
      />
    </>
  );
}
