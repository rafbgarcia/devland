import { Navigate, Outlet, createFileRoute } from '@tanstack/react-router';

import { ProjectWorkspace } from '@/renderer/components/project-workspace';
import { useProjectRepo } from '@/renderer/hooks/use-project-repo';

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
      <Outlet key={repoId} />
    </ProjectWorkspace>
  );
}
