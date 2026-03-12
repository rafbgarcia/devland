import { HashIcon } from 'lucide-react';
import { createFileRoute } from '@tanstack/react-router';

import { ProjectWorkspacePlaceholderView } from '@/renderer/components/project-workspace-placeholder-view';

export const Route = createFileRoute('/projects/$repoId/channels')({
  component: ProjectChannelsRoute,
});

function ProjectChannelsRoute() {
  return (
    <ProjectWorkspacePlaceholderView
      activeView="channels"
      icon={HashIcon}
      title="Channels"
      description="Team conversations and updates for this project."
    />
  );
}
