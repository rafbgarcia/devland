import { useEffect, useState } from 'react';

import { getRouteApi } from '@tanstack/react-router';
import {
  CircleDotIcon,
  DownloadIcon,

  GitForkIcon,
  Github,
  ScaleIcon,
  StarIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

import type { GithubRepoOverview } from '@/ipc/contracts';
import { MissingGhCli } from '@/renderer/shared/ui/missing-gh-cli';
import { useRepoActions } from './use-repos';
import { useRemoteRepoReadme } from './use-remote-repo-readme';
import { useGithubRepoOverview } from './use-github-repo-overview';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
import { Spinner } from '@/shadcn/components/ui/spinner';

const rootRouteApi = getRouteApi('__root__');

const MARKDOWN_PROSE_CLASS_NAME =
  'prose prose-sm max-w-none text-foreground prose-headings:font-medium prose-headings:text-foreground prose-p:text-foreground prose-p:leading-7 prose-a:text-primary prose-strong:text-foreground prose-code:rounded-md prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-medium prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:border prose-pre:border-border/50 prose-pre:bg-card prose-pre:px-4 prose-pre:py-3 prose-pre:text-foreground prose-img:rounded-lg dark:prose-invert';

function formatCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }

  return String(count);
}

function RepoStats({ overview }: { overview: GithubRepoOverview }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <StarIcon className="size-3.5" />
        {formatCount(overview.stars)}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <GitForkIcon className="size-3.5" />
        {formatCount(overview.forks)}
      </span>
      {overview.openIssues > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <CircleDotIcon className="size-3.5" />
          {formatCount(overview.openIssues)} issues
        </span>
      )}
      {overview.license !== null && overview.license !== 'NOASSERTION' && (
        <span className="inline-flex items-center gap-1.5">
          <ScaleIcon className="size-3.5" />
          {overview.license}
        </span>
      )}
      {overview.language !== null && (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-primary" />
          {overview.language}
        </span>
      )}
    </div>
  );
}

export function CodeCloneView({
  repoId,
  slug,
}: {
  repoId: string;
  slug: string;
}) {
  const { ghCliAvailable } = rootRouteApi.useLoaderData();
  const { updateRepoPath } = useRepoActions();
  const readme = useRemoteRepoReadme(slug);
  const overview = useGithubRepoOverview(slug);
  const [isCloning, setIsCloning] = useState(false);
  const [progressLines, setProgressLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [owner, name] = slug.split('/');

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
      setError(err instanceof Error ? err.message : 'Clone failed.');
      setIsCloning(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
      {/* Clone alert */}
      <Alert variant="warning">
        <Github />
        <AlertTitle>Viewing Github repository</AlertTitle>
        <AlertDescription className='flex items-center gap-4'>
          Clone the repository to start working locally.
          <div className="col-start-2 flex flex-wrap items-center gap-2">
            {!ghCliAvailable && (
              <MissingGhCli tooltip="Cloning requires the gh CLI" />
            )}
            <Button
              disabled={isCloning || !ghCliAvailable}
              onClick={handleClone}
              type="button"
              size="sm"
            >
              {isCloning ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <DownloadIcon data-icon="inline-start" />
              )}
              {isCloning ? 'Cloning...' : `Clone to ~/github.com/${slug}`}
            </Button>
          </div>
        </AlertDescription>

        {error !== null && (
          <p className="col-start-2 mt-2 text-sm text-destructive">{error}</p>
        )}

        {progressLines.length > 0 && (
          <pre className="col-start-2 mt-2 max-h-36 overflow-y-auto rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
            {progressLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </pre>
        )}
      </Alert>

      {/* Repo header */}
      <header className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            <a
              href={`https://github.com/${slug}`}
              rel="noreferrer"
              target="_blank"
              className="hover:underline underline-offset-4"
            >
              <span className="text-muted-foreground font-normal">{owner}</span>
              <span className="text-muted-foreground/50 font-normal"> / </span>
              {name}
            </a>
          </h1>

          {overview.status === 'ready' && overview.data?.description && (
            <p className="text-base text-muted-foreground leading-relaxed">
              {overview.data.description}
            </p>
          )}
        </div>

        {overview.status === 'ready' && overview.data !== null && (
          <RepoStats overview={overview.data} />
        )}

        {overview.status === 'ready' &&
          overview.data !== null &&
          overview.data.topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {overview.data.topics.slice(0, 12).map((topic) => (
                <Badge key={topic} variant="secondary" className="font-normal">
                  {topic}
                </Badge>
              ))}
            </div>
          )}
      </header>

      {/* README */}
      <section>
        {readme.status === 'loading' && (
          <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <Spinner />
            Loading README
          </div>
        )}

        {readme.status === 'error' && (
          <p className="py-8 text-sm text-muted-foreground">
            Could not load README.
          </p>
        )}

        {readme.status === 'ready' && readme.data !== null && (
          <div className="rounded-xl border border-border bg-card/50 px-8 py-6">
            <div className={MARKDOWN_PROSE_CLASS_NAME}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  ul: ({ children, ...props }) => (
                    <ul
                      className="my-4 flex list-disc flex-col gap-1 pl-5"
                      {...props}
                    >
                      {children}
                    </ul>
                  ),
                  ol: ({ children, ...props }) => (
                    <ol
                      className="my-4 flex list-decimal flex-col gap-1 pl-5"
                      {...props}
                    >
                      {children}
                    </ol>
                  ),
                  blockquote: ({ children, ...props }) => (
                    <blockquote
                      className="border-l-2 border-border/70 pl-4 text-muted-foreground"
                      {...props}
                    >
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {readme.data.markdown}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
