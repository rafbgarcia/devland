import { Navigate, Outlet, createFileRoute } from '@tanstack/react-router';

import { useProjectRepo } from '@/renderer/hooks/use-project-repo';

export const Route = createFileRoute('/projects/$repoId')({
  component: ProjectRouteLayout,
});

function ProjectRouteLayout() {
  const repo = useProjectRepo();

  if (repo === null) {
    return <Navigate replace to="/projects" />;
  }

  return <Outlet />;
}
