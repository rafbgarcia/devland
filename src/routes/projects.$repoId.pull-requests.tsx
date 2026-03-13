import { createFileRoute } from '@tanstack/react-router';

import { ProjectPullRequestsFeed } from '@/renderer/components/project-pull-requests-feed';
import { ProjectWorkspace } from '@/renderer/components/project-workspace';

export const Route = createFileRoute('/projects/$repoId/pull-requests')({
  component: ProjectPullRequestsRoute,
});

function ProjectPullRequestsRoute() {
  const { repoId } = Route.useParams();

  return (
    <ProjectWorkspace
      activeRepoId={repoId}
      activeView="pull-requests"
    >
      <ProjectPullRequestsFeed />
    </ProjectWorkspace>
  );
}
