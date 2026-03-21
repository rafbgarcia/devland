import { useMemo, useState } from 'react';

import { MessageSquareDotIcon } from 'lucide-react';

import type { DevlandRepoContext } from '@devlandapp/sdk';

import { IssuesSettingsButton } from '@/components/issues-settings-dialog';
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
      headerTrailing: <IssuesSettingsButton slug={repo.githubSlug} />,
      renderItem: (item) => (
        <IssueFeedItem
          item={item}
          slug={repo.githubSlug}
          isSelected={item.number === selectedIssueNumber}
          onSelect={(candidate) => setSelectedIssueNumber(candidate.number)}
        />
      ),
    }),
    [selectedIssueNumber, repo.githubSlug],
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
        slug={repo.githubSlug}
        onClose={() => setSelectedIssueNumber(null)}
      />
    </>
  );
}
