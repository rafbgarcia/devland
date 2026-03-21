import { useMemo, useState } from 'react';

import { GitPullRequestArrowIcon } from 'lucide-react';

import type { DevlandRepoContext } from '@devlandapp/sdk';

import type { ProjectPullRequestFeed } from '@/pull-requests/contracts';
import {
  ProjectFeedScaffold,
  type ProjectFeedDefinition,
} from '@/renderer/shared/ui/project-feed/project-feed';

import { PullRequestDetailDrawer } from './pull-request-detail-drawer';
import { PullRequestFeedItem } from './pull-request-feed-item';
import { useProjectPullRequests } from './use-project-pull-requests';

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
