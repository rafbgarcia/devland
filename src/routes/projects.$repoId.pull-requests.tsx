import { createFileRoute } from '@tanstack/react-router';

import { ProjectPullRequestsFeed } from '@/renderer/components/project-pull-requests-feed';

export const Route = createFileRoute('/projects/$repoId/pull-requests')({
  component: ProjectPullRequestsFeed,
});
