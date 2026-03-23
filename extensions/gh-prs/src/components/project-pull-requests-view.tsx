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

type DrawerState = {
  prNumber: number | null;
  initialTab: 'details' | 'prompt-session';
};

export function ProjectPullRequestsView({
  repo,
}: {
  repo: DevlandRepoContext;
}) {
  const { refetch, isRefetching, ...feedState } = useProjectPullRequests(repo);
  const [drawer, setDrawer] = useState<DrawerState>({ prNumber: null, initialTab: 'details' });

  const selectedPr = feedState.status === 'ready'
    ? feedState.data.items.find((item) => item.number === drawer.prNumber) ?? null
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
          isSelected={item.number === drawer.prNumber}
          onSelect={(candidate) =>
            setDrawer({ prNumber: candidate.number, initialTab: 'details' })
          }
          onReview={(candidate) =>
            setDrawer({ prNumber: candidate.number, initialTab: 'prompt-session' })
          }
        />
      ),
    }),
    [drawer.prNumber],
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
        repo={repo}
        pr={selectedPr}
        prNumber={drawer.prNumber}
        initialTab={drawer.initialTab}
        onClose={() => setDrawer({ prNumber: null, initialTab: 'details' })}
      />
    </>
  );
}
