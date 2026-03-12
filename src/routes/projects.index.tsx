import { Navigate, createFileRoute } from '@tanstack/react-router';

import { ProjectWorkspace } from '@/renderer/components/project-workspace';
import { useAppBootstrap } from '@/renderer/hooks/use-app-bootstrap';
import {
  getProjectTabRouteTo,
  resolvePreferredRepoId,
} from '@/renderer/lib/projects';

export const Route = createFileRoute('/projects/')({
  loader: () => window.electronAPI.getWorkspacePreferences(),
  component: ProjectsIndexRoute,
});

function ProjectsIndexRoute() {
  const { repos } = useAppBootstrap();
  const preferences = Route.useLoaderData();

  if (repos.length === 0) {
    return (
      <ProjectWorkspace
        repos={repos}
        activeRepoId={null}
        activeView={preferences.lastTab}
      />
    );
  }

  const repoId = resolvePreferredRepoId(repos, preferences.lastRepoId);

  if (repoId === null) {
    return (
      <ProjectWorkspace
        repos={repos}
        activeRepoId={null}
        activeView={preferences.lastTab}
      />
    );
  }

  return (
    <Navigate
      replace
      to={getProjectTabRouteTo(preferences.lastTab)}
      params={{ repoId }}
    />
  );
}
