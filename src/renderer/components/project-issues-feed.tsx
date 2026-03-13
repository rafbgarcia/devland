import { useState } from 'react';

import { MessageSquareDotIcon } from 'lucide-react';

import type { ProjectIssueFeed, ProjectIssueFeedItem } from '@/ipc/contracts';
import {
  ProjectFeedItemFrame,
  ProjectFeedScaffold,
  type ProjectFeedDefinition,
} from '@/renderer/components/project-workspace-feed';
import { useProjectFeed } from '@/renderer/hooks/use-project-feed';
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
        title={
          <span className="truncate text-sm font-medium text-foreground">
            {item.title}{' '}
            <span className="font-normal text-muted-foreground">(#{item.number})</span>
          </span>
        }
      />
    </button>
  );
}

export function ProjectIssuesFeed({ projectPath }: { projectPath: string }) {
  const { refetch, isRefetching, ...feedState } = useProjectFeed(projectPath, 'issues');
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
        projectPath={projectPath}
        issueNumber={selectedIssueNumber}
        onClose={() => setSelectedIssueNumber(null)}
      />
    </>
  );
}
