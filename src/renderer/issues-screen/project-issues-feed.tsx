import { useState } from 'react';

import { MessageSquareDotIcon } from 'lucide-react';

import type { ProjectIssueFeed } from '@/ipc/contracts';
import {
  ProjectFeedScaffold,
  type ProjectFeedDefinition,
} from '@/renderer/shared/project-feed/project-feed';

import { IssueFeedItem } from './issue-feed-item';
import { IssueDetailDrawer } from './issue-detail-drawer';
import { useProjectIssues } from './use-project-issues';

export function ProjectIssuesFeed() {
  const { refetch, isRefetching, ...feedState } = useProjectIssues();
  const [selectedIssueNumber, setSelectedIssueNumber] = useState<number | null>(null);
  const selectedIssue = feedState.status === 'ready'
    ? feedState.data.items.find((item) => item.number === selectedIssueNumber) ?? null
    : null;

  const issueFeedDefinition: ProjectFeedDefinition<ProjectIssueFeed> = {
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
        onSelect={(i) => setSelectedIssueNumber(i.number)}
      />
    ),
  };

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
