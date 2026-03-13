import { Navigate, createFileRoute } from '@tanstack/react-router';

import { useWorkspaceSession } from '@/renderer/hooks/use-workspace-session';
import { getProjectTabRouteTo } from '@/renderer/lib/projects';

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
