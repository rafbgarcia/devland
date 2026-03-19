import { Navigate, createFileRoute } from '@tanstack/react-router';

import { useWorkspaceSession } from '@/renderer/projects-shell/use-workspace-session';
import { getProjectTabRouteTo } from '@/renderer/shared/lib/projects';

export const Route = createFileRoute('/projects/$repoId/')({
  component: ProjectIndexRoute,
});

function ProjectIndexRoute() {
  const { repoId } = Route.useParams();
  const { session } = useWorkspaceSession();

  return (
    <Navigate
      replace
      to={getProjectTabRouteTo(session.activeTab)}
      params={{ repoId }}
    />
  );
}
