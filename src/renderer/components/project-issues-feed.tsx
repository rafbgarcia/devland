import { useState } from 'react';

import { MessageSquareDotIcon } from 'lucide-react';

import type { ProjectIssueFeed, ProjectIssueFeedItem } from '@/ipc/contracts';
import {
  ProjectFeedItemFrame,
  ProjectFeedScaffold,
  type ProjectFeedDefinition,
} from '@/renderer/components/project-workspace-feed';
import { useProjectIssues } from '@/renderer/hooks/use-project-issues';
import { cn } from '@/shadcn/lib/utils';

import { IssueDetailDrawer } from './issue-detail-drawer';

function IssueFeedItem({
  item,
  isSelected,
  onSelect,
}: {
  item: ProjectIssueFeedItem;
  isSelected: boolean;
  onSelect: (item: ProjectIssueFeedItem) => void;
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
        'w-full cursor-pointer text-left transition-colors hover:bg-muted/50',
        isSelected && 'bg-muted',
      )}
    >
      <ProjectFeedItemFrame
        item={item}
        title={
          <span className="truncate text-sm font-medium text-foreground">
            {item.title}{' '}
            <span className="font-normal text-muted-foreground">(#{item.number})</span>
          </span>
        }
      />
    </div>
  );
}

export function ProjectIssuesFeed() {
  const { refetch, isRefetching, ...feedState } = useProjectIssues();
  const [selectedIssueNumber, setSelectedIssueNumber] = useState<number | null>(null);

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
        issueNumber={selectedIssueNumber}
        onClose={() => setSelectedIssueNumber(null)}
      />
    </>
  );
}
