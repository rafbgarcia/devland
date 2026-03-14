import { createFileRoute } from '@tanstack/react-router';

import { ProjectChannelsView } from '@/renderer/components/project-channels-view';

export const Route = createFileRoute('/projects/$repoId/channels')({
  component: ProjectChannelsRoute,
});

function ProjectChannelsRoute() {
  return <ProjectChannelsView />;
}
