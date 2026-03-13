import { Navigate, createFileRoute } from '@tanstack/react-router';

import { ProjectWorkspace } from '@/renderer/components/project-workspace';
import { useRepos } from '@/renderer/hooks/use-repos';
import { useWorkspaceSession } from '@/renderer/hooks/use-workspace-session';
import {
  getProjectTabRouteTo,
  resolvePreferredRepoId,
} from '@/renderer/lib/projects';

export const Route = createFileRoute('/projects/')({
  component: ProjectsIndexRoute,
});

function ProjectsIndexRoute() {
  const repos = useRepos();
  const { session } = useWorkspaceSession();

  if (repos.length === 0) {
    return (
      <ProjectWorkspace
        activeRepoId={null}
        activeView={session.activeTab}
      />
    );
  }

  const repoId = resolvePreferredRepoId(repos, session.activeRepoId);

  if (repoId === null) {
    return (
      <ProjectWorkspace
        activeRepoId={null}
        activeView={session.activeTab}
      />
    );
  }

  return (
    <Navigate
      replace
      to={getProjectTabRouteTo(session.activeTab)}
      params={{ repoId }}
    />
  );
}
