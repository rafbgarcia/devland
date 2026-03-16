import { useState } from 'react';

import { useAtom } from 'jotai';
import { GitPullRequestArrowIcon } from 'lucide-react';

import type { ProjectPullRequestFeed } from '@/ipc/contracts';
import {
  ProjectFeedScaffold,
  type ProjectFeedDefinition,
} from '@/renderer/shared/ui/project-feed/project-feed';
import { useProjectRepoDetailsState } from '@/renderer/projects-shell/use-project-repo';

import { PullRequestFeedItem } from './pull-request-feed-item';
import { reviewPrAtom } from './pr-review-button';
import { PrReviewDialog } from './pr-review-dialog';
import { PullRequestDetailDrawer } from './pull-request-detail-drawer';
import { useProjectPullRequests } from './use-project-prs';

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
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setReviewPr(null);
          }}
        />
      )}
    </>
  );
}
