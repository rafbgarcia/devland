import { createFileRoute } from '@tanstack/react-router';

import { ProjectIssuesFeed } from '@/renderer/components/project-issues-feed';
import { ProjectWorkspace } from '@/renderer/components/project-workspace';
import { useProjectRoute } from '@/renderer/hooks/use-project-route';

export const Route = createFileRoute('/projects/$repoId/issues')({
  component: ProjectIssuesRoute,
});

function ProjectIssuesRoute() {
  const { repos, activeRepo } = useProjectRoute();

  if (activeRepo === null) {
    return null;
  }

  return (
    <ProjectWorkspace
      repos={repos}
      activeRepoId={activeRepo.id}
      activeView="issues"
    >
      <ProjectIssuesFeed projectPath={activeRepo.path} />
    </ProjectWorkspace>
  );
}
