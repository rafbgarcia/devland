import { useMemo, useState } from 'react';

import { GitPullRequestArrowIcon } from 'lucide-react';

import type { DevlandRepoContext } from '@devlandapp/sdk';

import {
  ProjectFeedScaffold,
  type ProjectFeedDefinition,
} from '@/components/project-feed';
import { useProjectPullRequests } from '@/hooks/use-project-pull-requests';
import type { ProjectPullRequestFeed } from '@/types/pull-requests';
import {
  PullRequestDetailDrawer,
} from './pull-request-detail-drawer';
import { PullRequestFeedItem } from './pull-request-feed-item';

export function ProjectPullRequestsView({
  repo,
}: {
  repo: DevlandRepoContext;
}) {
  const { refetch, isRefetching, ...feedState } = useProjectPullRequests(repo);
  const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(null);
  const selectedPr = feedState.status === 'ready'
    ? feedState.data.items.find((item) => item.number === selectedPrNumber) ?? null
    : null;

  const pullRequestFeedDefinition: ProjectFeedDefinition<ProjectPullRequestFeed> = useMemo(
    () => ({
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
          onSelect={(candidate) => setSelectedPrNumber(candidate.number)}
        />
      ),
    }),
    [selectedPrNumber],
  );

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
    </>
  );
}
