import { Navigate, createFileRoute } from '@tanstack/react-router';

import { useWorkspaceSession } from '@/renderer/projects-shell/use-workspace-session';
import { getProjectTabRoute } from '@/renderer/shared/lib/projects';
import { getRememberedProjectTabId } from '@/renderer/shared/lib/workspace-view-state';

export const Route = createFileRoute('/projects/$repoId/')({
  component: ProjectIndexRoute,
});

function ProjectIndexRoute() {
  const { repoId } = Route.useParams();
  const { session } = useWorkspaceSession();

  return (
    <Navigate
      replace
      {...getProjectTabRoute(
        repoId,
        getRememberedProjectTabId(session, repoId),
      )}
    />
  );
}
