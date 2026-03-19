import { useState } from 'react';
import { Navigate, createFileRoute } from '@tanstack/react-router';
import { GithubIcon, PlusIcon } from 'lucide-react';

import { AddProjectDialog } from '@/renderer/projects-shell/project-workspace';
import { useRepoActions, useRepos } from '@/renderer/projects-shell/use-repos';
import { useWorkspaceSession } from '@/renderer/projects-shell/use-workspace-session';
import {
  getProjectTabRoute,
  resolvePreferredRepoId,
} from '@/renderer/shared/lib/projects';
import { getRememberedProjectTabId } from '@/renderer/shared/lib/workspace-view-state';
import { Button } from '@/shadcn/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';

export const Route = createFileRoute('/projects/')({
  component: ProjectsIndexRoute,
});

function ProjectsIndexRoute() {
  const repos = useRepos();
  const { session } = useWorkspaceSession();

  if (repos.length === 0) {
    return <ProjectsEmptyState />;
  }

  const repoId = resolvePreferredRepoId(repos, session.activeRepoId);

  if (repoId === null) {
    return <ProjectsEmptyState />;
  }

  const tabId = getRememberedProjectTabId(session, repoId);

  return <Navigate replace {...getProjectTabRoute(repoId, tabId)} />;
}

function ProjectsEmptyState() {
  const { addRepo } = useRepoActions();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(true);

  return (
    <section className="flex w-full flex-col gap-6">
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="px-6 py-16">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GithubIcon />
              </EmptyMedia>
              <EmptyTitle>No projects yet</EmptyTitle>
              <EmptyDescription>
                Add a local Git repository or a remote GitHub repo to start tracking
                issues and pull requests.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setIsAddDialogOpen(true)} type="button">
                <PlusIcon data-icon="inline-start" />
                Add your first project
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      </div>

      <AddProjectDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onProjectAdded={() => {}}
        onSaveRepo={addRepo}
      />
    </section>
  );
}
