import { Navigate, createFileRoute } from '@tanstack/react-router';

import { getProjectTabRouteTo } from '@/renderer/lib/projects';

export const Route = createFileRoute('/projects/$repoId/')({
  loader: () => window.electronAPI.getWorkspacePreferences(),
  component: ProjectIndexRoute,
});

function ProjectIndexRoute() {
  const { repoId } = Route.useParams();
  const preferences = Route.useLoaderData();

  return (
    <Navigate
      replace
      to={getProjectTabRouteTo(preferences.lastTab)}
      params={{ repoId }}
    />
  );
}
