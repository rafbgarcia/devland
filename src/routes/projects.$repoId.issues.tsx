import { createFileRoute } from '@tanstack/react-router';

import { ProjectIssuesFeed } from '@/renderer/components/project-issues-feed';
import { ProjectWorkspace } from '@/renderer/components/project-workspace';

export const Route = createFileRoute('/projects/$repoId/issues')({
  component: ProjectIssuesRoute,
});

function ProjectIssuesRoute() {
  const { repoId } = Route.useParams();

  return (
    <ProjectWorkspace
      activeRepoId={repoId}
      activeView="issues"
    >
      <ProjectIssuesFeed />
    </ProjectWorkspace>
  );
}
