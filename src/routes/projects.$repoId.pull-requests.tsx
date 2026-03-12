import { createFileRoute } from '@tanstack/react-router';

import { ProjectPullRequestsFeed } from '@/renderer/components/project-pull-requests-feed';
import { ProjectWorkspace } from '@/renderer/components/project-workspace';
import { useProjectRoute } from '@/renderer/hooks/use-project-route';

export const Route = createFileRoute('/projects/$repoId/pull-requests')({
  component: ProjectPullRequestsRoute,
});

function ProjectPullRequestsRoute() {
  const { repos, activeRepo } = useProjectRoute();

  if (activeRepo === null) {
    return null;
  }

  return (
    <ProjectWorkspace
      repos={repos}
      activeRepoId={activeRepo.id}
      activeView="pull-requests"
    >
      <ProjectPullRequestsFeed projectPath={activeRepo.path} />
    </ProjectWorkspace>
  );
}
