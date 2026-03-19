import { useCallback } from 'react';

import type { ProjectIssueFeed } from '@/ipc/contracts';
import { type ProjectFeedStatus } from '@/renderer/shared/ui/project-feed/project-feed';
import { useProjectFeedState } from '@/renderer/shared/ui/project-feed/use-project-feed-state';

type ProjectIssuesState = ProjectFeedStatus<ProjectIssueFeed>;

export function useProjectIssues(): ProjectIssuesState & {
  isRefetching: boolean;
  refetch: () => void;
} {
  const fetchIssues = useCallback(
    ({ owner, name, skipCache }: { owner: string; name: string; skipCache: boolean }) =>
      window.electronAPI.getProjectIssues(owner, name, skipCache),
    [],
  );

  return useProjectFeedState({
    fetchFeed: fetchIssues,
    errorMessage: 'Could not fetch project issues.',
  });
}
