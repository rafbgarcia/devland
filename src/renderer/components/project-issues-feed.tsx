import { MessageSquareDotIcon } from 'lucide-react';

import type { ProjectIssueFeedItem } from '@/ipc/contracts';
import { useProjectFeed } from '@/renderer/hooks/use-project-feed';
import { ProjectFeedItemFrame, ProjectFeedScaffold } from '@/renderer/components/project-workspace-feed';

function IssueFeedItem({ item }: { item: ProjectIssueFeedItem }) {
  return (
    <ProjectFeedItemFrame
      item={item}
      title={
        <a
          className="truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
          href={item.url}
          rel="noreferrer"
          target="_blank"
        >
          {item.title}{' '}
          <span className="font-normal text-muted-foreground">(#{item.number})</span>
        </a>
      }
    />
  );
}

export function ProjectIssuesFeed({ projectPath }: { projectPath: string }) {
  const { refetch, isRefetching, ...feedState } = useProjectFeed(projectPath, 'issues');

  return (
    <ProjectFeedScaffold
      state={feedState}
      isRefetching={isRefetching}
      onRefetch={refetch}
      loadingMessage="Fetching issues from GitHub"
      emptyIcon={<MessageSquareDotIcon />}
      emptyTitle="No open issues"
      emptyDescription="This project has no open issues right now."
      refreshLabel="issues"
      listLabel="issues"
      renderItem={(item) => <IssueFeedItem item={item} />}
    />
  );
}
