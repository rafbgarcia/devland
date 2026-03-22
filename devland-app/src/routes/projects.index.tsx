import { Navigate, createFileRoute, getRouteApi } from '@tanstack/react-router';
import { AlertTriangleIcon } from 'lucide-react';

import { MissingGhCli } from '@/renderer/shared/ui/missing-gh-cli';

import { ProjectWorkspace } from '@/renderer/projects-shell/project-workspace';
import { useRepos } from '@/renderer/projects-shell/use-repos';
import { useWorkspaceSession } from '@/renderer/projects-shell/use-workspace-session';
import {
  getProjectTabRoute,
  resolvePreferredRepoId,
} from '@/renderer/shared/lib/projects';
import { getRememberedProjectTabId } from '@/renderer/shared/lib/workspace-view-state';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Kbd } from '@/shadcn/components/ui/kbd';
import { cn } from '@/shadcn/lib/utils';

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

function CurvedArrowUp() {
  return (
    <svg
      width="48"
      height="64"
      viewBox="0 0 48 64"
      fill="none"
      className="text-muted-foreground"
    >
      <path
        d="M24 60 C24 28, 12 16, 4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M2 16 L4 4 L14 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function ProjectsEmptyState() {
  const { ghCliAvailable } = rootRouteApi.useLoaderData();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-2 pl-4 pt-4">
        <CurvedArrowUp />
        <div className='mt-6 flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground'>
          <p>
            Click the plus icon to add a repo.
          </p>
          <p>
            {!ghCliAvailable && <MissingGhCli tooltip={<>Install it <a href="https://cli.github.com/">https://cli.github.com/</a></>} />}{' '}
            Input <Kbd className="text-xs">owner/repo</Kbd> directly to view Github repos without cloning them.
          </p>

          {!ghCliAvailable && (
            <Alert variant="warning">
              <AlertTriangleIcon />
              <AlertTitle>GitHub CLI not found</AlertTitle>
              <AlertDescription>
                Some features require the <Kbd>gh</Kbd> CLI.
                <br/>
                Install and authenticate using <Kbd>gh auth login</Kbd>, then refresh/restart Devland.
                <br/>
                <br/>
                See official instructions at <a href="https://cli.github.com/">https://cli.github.com/</a>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>

    </div>
  );
}
