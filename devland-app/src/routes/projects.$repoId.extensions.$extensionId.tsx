import { createFileRoute } from '@tanstack/react-router';
import { AlertCircleIcon } from 'lucide-react';

import { ProjectExtensionView } from '@/renderer/extensions-screen/project-extension-view';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';

export const Route = createFileRoute('/projects/$repoId/extensions/$extensionId')({
  component: ProjectExtensionRoute,
  errorComponent: ExtensionErrorFallback,
});

function ProjectExtensionRoute() {
  const { extensionId } = Route.useParams();

  return <ProjectExtensionView extensionId={extensionId} />;
}

function ExtensionErrorFallback({ error }: { error: Error }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Alert variant="destructive" className="max-w-lg">
        <AlertCircleIcon />
        <AlertTitle>Extension crashed</AlertTitle>
        <AlertDescription>
          {error.message || 'An unexpected error occurred while loading this extension.'}
        </AlertDescription>
      </Alert>
    </div>
  );
}
