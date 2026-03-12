import { createFileRoute } from '@tanstack/react-router';

import { ProjectWorkspace } from '@/renderer/components/project-workspace';
import { useAppBootstrap } from '@/renderer/hooks/use-app-bootstrap';

export const Route = createFileRoute('/')({
  component: HomeRoute,
});

function HomeRoute() {
  const { repos } = useAppBootstrap();

  return <ProjectWorkspace repos={repos} />;
}
