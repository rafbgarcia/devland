import { useMemo, useState } from 'react';

import { MessageSquareDotIcon } from 'lucide-react';

import type { DevlandRepoContext } from '@devlandapp/sdk';

import {
  ProjectFeedScaffold,
  type ProjectFeedDefinition,
} from '@/components/project-feed';
import { useProjectIssues } from '@/hooks/use-project-issues';
import type { ProjectIssueFeed } from '@/types/issues';
import {
  IssueDetailDrawer,
} from './issue-detail-drawer';
import { IssueFeedItem } from './issue-feed-item';

export function ProjectIssuesView({
  repo,
}: {
  repo: DevlandRepoContext;
}) {
  const { refetch, isRefetching, ...feedState } = useProjectIssues(repo);
  const [selectedIssueNumber, setSelectedIssueNumber] = useState<number | null>(null);
  const selectedIssue = feedState.status === 'ready'
    ? feedState.data.items.find((item) => item.number === selectedIssueNumber) ?? null
    : null;

  const issueFeedDefinition: ProjectFeedDefinition<ProjectIssueFeed> = useMemo(
    () => ({
      loadingMessage: 'Fetching issues from GitHub',
      emptyState: {
        icon: <MessageSquareDotIcon />,
        title: 'No open issues',
        description: 'This project has no open issues right now.',
      },
      labels: {
        refresh: 'issues',
        list: 'issues',
      },
      renderItem: (item) => (
        <IssueFeedItem
          item={item}
          isSelected={item.number === selectedIssueNumber}
          onSelect={(candidate) => setSelectedIssueNumber(candidate.number)}
        />
      ),
    }),
    [selectedIssueNumber],
  );

  return (
    <>
      <ProjectFeedScaffold
        state={feedState}
        isRefetching={isRefetching}
        onRefetch={refetch}
        definition={issueFeedDefinition}
      />
      <IssueDetailDrawer
        issue={selectedIssue}
        issueNumber={selectedIssueNumber}
        onClose={() => setSelectedIssueNumber(null)}
      />
    </>
  );
}
