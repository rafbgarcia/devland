import { createFileRoute } from '@tanstack/react-router';

import { ProjectIssuesFeed } from '@/renderer/components/project-issues-feed';

export const Route = createFileRoute('/projects/$repoId/issues')({
  component: ProjectIssuesFeed,
});
