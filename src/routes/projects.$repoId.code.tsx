import { createFileRoute } from '@tanstack/react-router';

import { CodeCloneView } from '@/renderer/components/code-clone-view';
import { CodeWorkspaceView } from '@/renderer/components/code-workspace-view';
import { useProjectRepo } from '@/renderer/hooks/use-project-repo';
import { isAbsoluteProjectPath } from '@/renderer/lib/projects';

export const Route = createFileRoute('/projects/$repoId/code')({
  component: ProjectCodeRoute,
});

function ProjectCodeRoute() {
  const repo = useProjectRepo();

  if (repo === null) {
    return null;
  }

  return isAbsoluteProjectPath(repo.path) ? (
    <CodeWorkspaceView repoPath={repo.path} />
  ) : (
    <CodeCloneView repoId={repo.id} slug={repo.path} />
  );
}
