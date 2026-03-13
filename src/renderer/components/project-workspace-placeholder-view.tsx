import type { LucideIcon } from 'lucide-react';

import type { ProjectViewTab } from '@/ipc/contracts';
import { ProjectWorkspace } from '@/renderer/components/project-workspace';
import { useProjectRepoId } from '@/renderer/hooks/use-project-repo';
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
  const activeRepoId = useProjectRepoId();

  return (
    <ProjectWorkspace
      activeRepoId={activeRepoId}
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
