import { useEffect, useState } from 'react';

import { getRouteApi } from '@tanstack/react-router';
import { DownloadIcon, FolderGit2Icon } from 'lucide-react';

import { MissingGhCli } from '@/renderer/shared/ui/missing-gh-cli';
import { useRepoActions } from './use-repos';
import { Button } from '@/shadcn/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import { Spinner } from '@/shadcn/components/ui/spinner';

const rootRouteApi = getRouteApi('__root__');

export function CodeCloneView({
  repoId,
  slug,
}: {
  repoId: string;
  slug: string;
}) {
  const { ghCliAvailable } = rootRouteApi.useLoaderData();
  const { updateRepoPath } = useRepoActions();
  const [isCloning, setIsCloning] = useState(false);
  const [progressLines, setProgressLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return window.electronAPI.onCloneProgress((line) => {
      setProgressLines((prev) => [...prev.slice(-20), line]);
    });
  }, []);

  const handleClone = async () => {
    setIsCloning(true);
    setError(null);
    setProgressLines([]);

    try {
      const clonedPath = await window.electronAPI.cloneGithubRepo(slug);

      updateRepoPath(repoId, clonedPath);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Clone failed.',
      );
      setIsCloning(false);
    }
  };

  return (
    <div className="px-6 py-16">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderGit2Icon />
          </EmptyMedia>
          <EmptyTitle>{slug}</EmptyTitle>
          <EmptyDescription>
            {!ghCliAvailable && <MissingGhCli tooltip="Cloning requires the gh CLI" />}
            Clone this repository to ~/github.com/{slug} to start working locally.
          </EmptyDescription>
        </EmptyHeader>

        <EmptyContent>
          {error !== null ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <Button
            disabled={isCloning || !ghCliAvailable}
            onClick={handleClone}
            type="button"
          >
            {isCloning ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <DownloadIcon data-icon="inline-start" />
            )}
            {isCloning ? 'Cloning...' : 'Clone repository'}
          </Button>
        </EmptyContent>

        {progressLines.length > 0 ? (
          <div className="mt-4 w-full max-w-lg rounded-lg bg-muted/50 p-3">
            <pre className="max-h-40 overflow-y-auto text-xs text-muted-foreground">
              {progressLines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </pre>
          </div>
        ) : null}
      </Empty>
    </div>
  );
}
