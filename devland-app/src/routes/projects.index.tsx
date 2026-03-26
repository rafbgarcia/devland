import { Navigate, createFileRoute, getRouteApi } from '@tanstack/react-router';
import { AlertTriangleIcon, FolderPlusIcon } from 'lucide-react';

import { MissingGhCli } from '@/renderer/shared/ui/missing-gh-cli';

import { ProjectWorkspace, useOpenAddProject } from '@/renderer/projects-shell/project-workspace';
import { useRepos } from '@/renderer/projects-shell/use-repos';
import { useWorkspaceSession } from '@/renderer/projects-shell/use-workspace-session';
import {
  getProjectTabRoute,
  resolvePreferredRepoId,
} from '@/renderer/shared/lib/projects';
import { getRememberedProjectTabId } from '@/renderer/shared/lib/workspace-view-state';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Button } from '@/shadcn/components/ui/button';
import { Kbd } from '@/shadcn/components/ui/kbd';

const rootRouteApi = getRouteApi('__root__');

export const Route = createFileRoute('/projects/')({
  component: ProjectsIndexRoute,
});

function ProjectsIndexRoute() {
  const repos = useRepos();
  const { session } = useWorkspaceSession();

  if (repos.length === 0) {
    return (
      <ProjectWorkspace activeRepoId={null}>
        <ProjectsEmptyState />
      </ProjectWorkspace>
    );
  }

  const repoId = resolvePreferredRepoId(repos, session.activeRepoId);

  if (repoId === null) {
    return (
      <ProjectWorkspace activeRepoId={null}>
        <ProjectsEmptyState />
      </ProjectWorkspace>
    );
  }

  const tabId = getRememberedProjectTabId(session, repoId);

  return <Navigate replace {...getProjectTabRoute(repoId, tabId)} />;
}

function ProjectsEmptyState() {
  const { ghCliAvailable } = rootRouteApi.useLoaderData();
  const openAddProject = useOpenAddProject();

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-6 text-center">
        <div className="rounded-xl border border-dashed border-muted-foreground/25 bg-muted/30 p-4">
          <FolderPlusIcon className="size-8 text-muted-foreground/60" />
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-base font-medium text-foreground">No projects yet</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Add a local repository or use{' '}
            {!ghCliAvailable && <MissingGhCli tooltip="Github owner/repo requires the gh CLI" />}
            <Kbd className="text-xs">owner/repo</Kbd> to browse a Github repo directly.
          </p>
        </div>

        <Button onClick={openAddProject} size="lg">
          <FolderPlusIcon data-icon="inline-start" />
          Add your first project
        </Button>

        {!ghCliAvailable && (
          <Alert variant="warning" className="text-left">
            <AlertTriangleIcon />
            <AlertTitle>GitHub CLI not found</AlertTitle>
            <AlertDescription>
              Some features require the <Kbd>gh</Kbd> CLI.
              <br />
              Install and authenticate using <Kbd>gh auth login</Kbd>, then refresh/restart Devland.
              <br />
              <br />
              See official instructions at <a href="https://cli.github.com/">https://cli.github.com/</a>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
