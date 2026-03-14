import { HashIcon } from 'lucide-react';
import { createFileRoute } from '@tanstack/react-router';

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';

export const Route = createFileRoute('/projects/$repoId/channels')({
  component: ProjectChannelsRoute,
});

function ProjectChannelsRoute() {
  return (
    <div className="px-6 py-16">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HashIcon />
          </EmptyMedia>
          <EmptyTitle>Channels</EmptyTitle>
          <EmptyDescription>
            Team conversations and updates for this project.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
