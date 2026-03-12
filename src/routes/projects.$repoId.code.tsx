import { CodeIcon } from 'lucide-react';
import { createFileRoute } from '@tanstack/react-router';

import { ProjectWorkspacePlaceholderView } from '@/renderer/components/project-workspace-placeholder-view';

export const Route = createFileRoute('/projects/$repoId/code')({
  component: ProjectCodeRoute,
});

function ProjectCodeRoute() {
  return (
    <ProjectWorkspacePlaceholderView
      activeView="code"
      icon={CodeIcon}
      title="Code"
      description="Browse source code, branches, and recent commits."
    />
  );
}
