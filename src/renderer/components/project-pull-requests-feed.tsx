import { useState } from 'react';

import { useAtom } from 'jotai';
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
import { useProjectRepoDetailsState } from '@/renderer/hooks/use-project-repo';
import { cn } from '@/shadcn/lib/utils';

import { PrReviewButton, reviewPrAtom } from './pr-review-button';
import { PrReviewDialog } from './pr-review-dialog';
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
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(item);
        }
      }}
      className={cn(
        'group/pr w-full text-left transition-colors hover:bg-muted/50',
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
        sublineExtra={<PrReviewButton size="xs" pr={item} className="opacity-0 group-hover/pr:opacity-100" />}
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

export function ProjectPullRequestsFeed() {
  const {
    refetch,
    isRefetching,
    reviewRefsSyncState,
    reviewRefsVersion,
    retryReviewRefsSync,
    ...feedState
  } = useProjectPullRequests();
  const repoDetails = useProjectRepoDetailsState();
  const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(null);
  const [reviewPr, setReviewPr] = useAtom(reviewPrAtom);
  const selectedPr = feedState.status === 'ready'
    ? feedState.data.items.find((item) => item.number === selectedPrNumber) ?? null
    : null;

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
        pr={selectedPr}
        prNumber={selectedPrNumber}
        onClose={() => setSelectedPrNumber(null)}
      />
      {repoDetails.status === 'ready' && (
        <PrReviewDialog
          pr={reviewPr}
          repoId={repoDetails.data.id}
          repoPath={repoDetails.data.path}
          slug={repoDetails.data.githubSlug}
          reviewRefsSyncState={reviewRefsSyncState}
          reviewRefsVersion={reviewRefsVersion}
          onRetryReviewRefsSync={retryReviewRefsSync}
          open={reviewPr !== null}
          onOpenChange={(open) => {
            if (!open) setReviewPr(null);
          }}
        />
      )}
    </>
  );
}
