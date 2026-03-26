import { Navigate, Outlet, createFileRoute } from '@tanstack/react-router';

import { ProjectWorkspace } from '@/renderer/projects-shell/project-workspace';
import { useProjectRepo } from '@/renderer/projects-shell/use-project-repo';

export const Route = createFileRoute('/projects/$repoId')({
  component: ProjectRouteLayout,
});

function ProjectRouteLayout() {
  const { repoId } = Route.useParams();
  const repo = useProjectRepo();

  if (repo === null) {
    return <Navigate replace to="/projects" />;
  }

  return (
    <ProjectWorkspace activeRepoId={repoId}>
      <Outlet />
    </ProjectWorkspace>
  );
}
