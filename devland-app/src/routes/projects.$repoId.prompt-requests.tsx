import { createFileRoute } from '@tanstack/react-router';

import { PromptRequestsScreen } from '@/renderer/prompt-requests-screen/prompt-requests-screen';
import { CodeCloneView } from '@/renderer/projects-shell/code-clone-view';
import { useProjectRepo } from '@/renderer/projects-shell/use-project-repo';
import { isAbsoluteProjectPath } from '@/renderer/shared/lib/projects';

export const Route = createFileRoute('/projects/$repoId/prompt-requests')({
  component: ProjectPromptRequestsRoute,
});

function ProjectPromptRequestsRoute() {
  const repo = useProjectRepo();

  if (repo === null) {
    return null;
  }

  return isAbsoluteProjectPath(repo.path) ? (
    <PromptRequestsScreen key={repo.id} repoPath={repo.path} />
  ) : (
    <CodeCloneView key={repo.id} repoId={repo.id} slug={repo.path} />
  );
}
