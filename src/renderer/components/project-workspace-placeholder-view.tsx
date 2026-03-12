import type { LucideIcon } from 'lucide-react';

import type { ProjectViewTab } from '@/ipc/contracts';
import { useProjectRoute } from '@/renderer/hooks/use-project-route';
import { ProjectWorkspace } from '@/renderer/components/project-workspace';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';

export function ProjectWorkspacePlaceholderView({
  activeView,
  icon: Icon,
  title,
  description,
}: {
  activeView: ProjectViewTab;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  const { repos, activeRepo } = useProjectRoute();

  return (
    <ProjectWorkspace
      repos={repos}
      activeRepoId={activeRepo?.id ?? null}
      activeView={activeView}
    >
      <div className="px-6 py-16">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon />
            </EmptyMedia>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </ProjectWorkspace>
  );
}
