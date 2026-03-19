import { createFileRoute } from '@tanstack/react-router';

import { ProjectExtensionView } from '@/renderer/extensions-screen/project-extension-view';

export const Route = createFileRoute('/projects/$repoId/extensions/$extensionId')({
  component: ProjectExtensionRoute,
});

function ProjectExtensionRoute() {
  const { extensionId } = Route.useParams();

  return <ProjectExtensionView extensionId={extensionId} />;
}
