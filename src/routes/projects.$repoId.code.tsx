import { createFileRoute } from '@tanstack/react-router';

import { CodeCloneView } from '@/renderer/components/code-clone-view';
import { CodeWorkspaceView } from '@/renderer/components/code-workspace-view';
import { ProjectWorkspace } from '@/renderer/components/project-workspace';
import { useProjectRepo } from '@/renderer/hooks/use-project-repo';
import { isAbsoluteProjectPath } from '@/renderer/lib/projects';

export const Route = createFileRoute('/projects/$repoId/code')({
  component: ProjectCodeRoute,
});

function ProjectCodeRoute() {
  const { repoId } = Route.useParams();
  const repo = useProjectRepo();

  return (
    <ProjectWorkspace activeRepoId={repoId} activeView="code">
      {repo !== null && isAbsoluteProjectPath(repo.path) ? (
        <CodeWorkspaceView repoPath={repo.path} />
      ) : repo !== null ? (
        <CodeCloneView repoId={repo.id} slug={repo.path} />
      ) : null}
    </ProjectWorkspace>
  );
}
