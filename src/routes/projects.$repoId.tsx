import { Navigate, Outlet, createFileRoute } from '@tanstack/react-router';

import { useAppBootstrap } from '@/renderer/hooks/use-app-bootstrap';

export const Route = createFileRoute('/projects/$repoId')({
  component: ProjectRouteGate,
});

function ProjectRouteGate() {
  const { repos } = useAppBootstrap();
  const { repoId } = Route.useParams();
  const activeRepo = repos.find((repo) => repo.id === repoId) ?? null;

  if (repos.length === 0 || activeRepo === null) {
    return <Navigate replace to="/projects" />;
  }

  return <Outlet />;
}
