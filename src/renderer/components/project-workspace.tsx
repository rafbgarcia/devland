import { useEffect, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { AnimatePresence, Reorder, motion } from 'motion/react';
import {
  FolderOpenIcon,
  GitPullRequestArrowIcon,
  GithubIcon,
  MessageSquareDotIcon,
  MoreHorizontalIcon,
  PlusIcon,
  RefreshCwIcon,
  XIcon,
} from 'lucide-react';

import type { ProjectFeedKind, Repo } from '@/ipc/contracts';
import { useProjectFeed } from '@/renderer/hooks/use-project-feed';
import {
  formatRelativeTime,
  getProjectLabel,
} from '@/renderer/lib/projects';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Button } from '@/shadcn/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shadcn/components/ui/dialog';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/shadcn/components/ui/field';
import { Input } from '@/shadcn/components/ui/input';
import { Separator } from '@/shadcn/components/ui/separator';
import { Spinner } from '@/shadcn/components/ui/spinner';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/shadcn/components/ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shadcn/components/ui/tooltip';
import { cn } from '@/shadcn/lib/utils';

const SUBTAB_OPTIONS = [
  { value: 'issues', label: 'Issues', icon: MessageSquareDotIcon },
  {
    value: 'pull-requests',
    label: 'Pull requests',
    icon: GitPullRequestArrowIcon,
  },
] as const satisfies ReadonlyArray<{
  value: ProjectFeedKind;
  label: string;
  icon: typeof MessageSquareDotIcon;
}>;

const VISIBLE_AUTHORS_LIMIT = 3;

function AddProjectDialog({
  open,
  onOpenChange,
  onProjectAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectAdded: (projectPath: string) => void;
}) {
  const [repoInput, setRepoInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePickLocalRepo = async () => {
    const selectedDirectory = await window.electronAPI.pickRepoDirectory();

    if (selectedDirectory === null) {
      return;
    }

    setRepoInput(selectedDirectory);
    setFormError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedValue = repoInput.trim();

    if (!trimmedValue) {
      setFormError('Enter a local repository path or a GitHub owner/repository.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      const repo = await window.electronAPI.saveRepo(trimmedValue);

      setRepoInput('');
      setFormError(null);
      onOpenChange(false);
      onProjectAdded(repo.path);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Could not add that repository.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          setRepoInput('');
          setFormError(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a project</DialogTitle>
          <DialogDescription>
            Add a local Git repository or a remote GitHub repo to start tracking
            issues and pull requests.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={Boolean(formError)}>
              <FieldLabel htmlFor="project-path">
                Absolute path or GitHub owner/repository
              </FieldLabel>
              <div className="flex gap-2">
                <Input
                  aria-invalid={Boolean(formError)}
                  autoComplete="off"
                  className="flex-1"
                  id="project-path"
                  name="projectPath"
                  onChange={(event) => {
                    setRepoInput(event.target.value);
                    if (formError) {
                      setFormError(null);
                    }
                  }}
                  placeholder="e.g. /Users/me/my-repo or owner/repo"
                  spellCheck={false}
                  type="text"
                  value={repoInput}
                />
                <Button
                  onClick={handlePickLocalRepo}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <FolderOpenIcon data-icon="inline-start" />
                  Browse
                </Button>
              </div>
              <FieldError>{formError}</FieldError>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              }
            />
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlusIcon data-icon="inline-start" />
              )}
              Add project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FeedDiffStats({
  commitCount,
  additions,
  deletions,
}: {
  commitCount: number;
  additions: number;
  deletions: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
      <span>{commitCount} {commitCount === 1 ? 'commit' : 'commits'}</span>
      <span className="text-emerald-600 dark:text-emerald-400">+{additions.toLocaleString()}</span>
      <span className="text-red-500 dark:text-red-400">-{deletions.toLocaleString()}</span>
    </span>
  );
}

function FeedCommentCount({ count, authors }: { count: number; authors: string[] }) {
  if (count === 0) {
    return <span>0 comments</span>;
  }

  const visible = authors.slice(0, VISIBLE_AUTHORS_LIMIT);
  const remaining = authors.slice(VISIBLE_AUTHORS_LIMIT);

  return (
    <span className="inline-flex items-center gap-1">
      <span>
        {count} {count === 1 ? 'comment' : 'comments'}
        {visible.length > 0 ? ` by ${visible.join(', ')}` : ''}
      </span>
      {remaining.length > 0 ? (
        <Tooltip>
          <TooltipTrigger
            className="inline-flex cursor-default items-center rounded-full bg-muted px-1 py-px text-[0.6rem] font-medium text-muted-foreground"
          >
            <MoreHorizontalIcon className="mr-0.5 size-2.5" />
            +{remaining.length}
          </TooltipTrigger>
          <TooltipContent>{remaining.join(', ')}</TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}

function FeedLabels({ labels }: { labels: Array<{ name: string; color: string }> }) {
  if (labels.length === 0) {
    return null;
  }

  return (
    <span className="inline-flex flex-wrap gap-1">
      {labels.map((label) => (
        <span
          key={label.name}
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-medium leading-none"
          style={{
            backgroundColor: `#${label.color}20`,
            color: `#${label.color}`,
            border: `1px solid #${label.color}40`,
          }}
        >
          {label.name}
        </span>
      ))}
    </span>
  );
}

export function ProjectWorkspace({ repos }: { repos: Repo[] }) {
  const router = useRouter();
  const [localRepos, setLocalRepos] = useState(repos);
  const [activeProjectPath, setActiveProjectPath] = useState<string | null>(
    repos[0]?.path ?? null,
  );
  const [activeSubtab, setActiveSubtab] = useState<ProjectFeedKind>('issues');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(repos.length === 0);
  const { refetch, isRefetching, ...feedState } = useProjectFeed(activeProjectPath, activeSubtab);

  // Sync local state when props change (e.g. after router invalidation from AddProjectDialog)
  useEffect(() => {
    setLocalRepos(repos);
  }, [repos]);

  useEffect(() => {
    if (localRepos.length === 0) {
      setActiveProjectPath(null);
      setIsAddDialogOpen(true);
      return;
    }

    setActiveProjectPath((current) => {
      if (current === null || !localRepos.some((repo) => repo.path === current)) {
        return localRepos[0]?.path ?? null;
      }
      return current;
    });
  }, [localRepos]);

  const handleRemoveRepo = (repoPath: string) => {
    setLocalRepos((prev) => {
      const next = prev.filter((r) => r.path !== repoPath);
      if (repoPath === activeProjectPath) {
        setActiveProjectPath(next[0]?.path ?? null);
      }
      return next;
    });
    void window.electronAPI.removeRepo(repoPath);
  };

  const handleReorder = (reordered: Repo[]) => {
    setLocalRepos(reordered);
    void window.electronAPI.reorderRepos(reordered.map((r) => r.path));
  };

  const handleProjectAdded = (projectPath: string) => {
    setLocalRepos((prev) =>
      prev.some((r) => r.path === projectPath) ? prev : [...prev, { path: projectPath }],
    );
    setActiveProjectPath(projectPath);
    void router.invalidate();
  };

  if (localRepos.length === 0) {
    return (
      <section className="flex w-full flex-col gap-6">
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="py-16 px-6">
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
          onProjectAdded={handleProjectAdded}
        />
      </section>
    );
  }

  return (
    <section className="flex w-full flex-col">
      {/* Tab bar */}
      <Reorder.Group
        axis="x"
        values={localRepos}
        onReorder={handleReorder}
        className="flex items-end gap-px bg-muted/40 px-2 pt-1.5"
        as="div"
      >
        <AnimatePresence initial={false}>
          {localRepos.map((repo) => {
            const isActive = repo.path === activeProjectPath;

            return (
              <Reorder.Item
                key={repo.path}
                value={repo}
                onClick={() => setActiveProjectPath(repo.path)}
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto', transition: { type: 'spring', bounce: 0, duration: 0.25 } }}
                exit={{ opacity: 0, width: 0, transition: { type: 'tween', ease: 'easeOut', duration: 0.15 } }}
                layout
                layoutTransition={{ type: 'spring', bounce: 0, duration: 0.25 }}
                className={cn(
                  'group relative flex max-w-50 cursor-default items-center gap-1 overflow-hidden rounded-t-lg px-3 py-1.5 text-[13px]',
                  isActive
                    ? 'bg-card text-foreground shadow-[0_-1px_3px_-1px_rgba(0,0,0,0.08)]'
                    : 'cursor-pointer text-muted-foreground hover:bg-muted/80 hover:text-foreground',
                )}
                as="div"
                whileDrag={{ scale: 1.03, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
              >
                <span className="truncate select-none whitespace-nowrap">{getProjectLabel(repo.path)}</span>
                <button
                  className={cn(
                    'ml-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm transition-colors',
                    isActive
                      ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      : 'opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground',
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveRepo(repo.path);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  type="button"
                >
                  <XIcon className="size-3" />
                </button>
              </Reorder.Item>
            );
          })}
        </AnimatePresence>

        <motion.button
          layout
          layoutTransition={{ type: 'spring', bounce: 0, duration: 0.25 }}
          onClick={() => setIsAddDialogOpen(true)}
          className="mb-0.5 ml-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          type="button"
        >
          <PlusIcon className="size-3.5" />
        </motion.button>
      </Reorder.Group>

      {/* Content area connected to active tab */}
      <div className="rounded-b-xl border border-border bg-card shadow-sm">
        {/* Subtab toggle */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <ToggleGroup
              onValueChange={(value) => {
                const nextSubtab = value.at(-1);

                if (nextSubtab === 'issues' || nextSubtab === 'pull-requests') {
                  setActiveSubtab(nextSubtab);
                }
              }}
              size="sm"
              spacing={1}
              value={[activeSubtab]}
              variant="outline"
            >
              {SUBTAB_OPTIONS.map((subtab) => {
                const Icon = subtab.icon;

                return (
                  <ToggleGroupItem key={subtab.value} value={subtab.value}>
                    <Icon />
                    {subtab.label}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>

            {feedState.status === 'ready' ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {feedState.data.items.length} open
                {' \u00b7 '}
                refreshed {formatRelativeTime(feedState.data.fetchedAt)}
                <button
                  className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  disabled={isRefetching}
                  onClick={refetch}
                  title="Refresh"
                  type="button"
                >
                  <RefreshCwIcon className={cn('size-3', isRefetching && 'animate-spin')} />
                </button>
              </span>
            ) : null}
          </div>
        </div>

        {/* Feed content */}
        <div className="min-h-96">
          {feedState.status === 'loading' ? (
            <div className="flex min-h-96 items-center justify-center">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Spinner />
                Fetching {activeSubtab === 'issues' ? 'issues' : 'pull requests'} from GitHub
              </div>
            </div>
          ) : null}

          {feedState.status === 'error' ? (
            <div className="p-5">
              <Alert variant="destructive">
                <GithubIcon />
                <AlertTitle>Could not load project data</AlertTitle>
                <AlertDescription>{feedState.error}</AlertDescription>
              </Alert>
            </div>
          ) : null}

          {feedState.status === 'ready' && feedState.data.items.length === 0 ? (
            <div className="py-16 px-6">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    {activeSubtab === 'issues' ? <MessageSquareDotIcon /> : <GitPullRequestArrowIcon />}
                  </EmptyMedia>
                  <EmptyTitle>
                    No open {activeSubtab === 'issues' ? 'issues' : 'pull requests'}
                  </EmptyTitle>
                  <EmptyDescription>
                    This project has no open {activeSubtab === 'issues' ? 'issues' : 'pull requests'} right now.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : null}

          {feedState.status === 'ready' && feedState.data.items.length > 0 ? (
            <div>
              {feedState.data.items.map((item, index) => (
                <div key={item.id}>
                  <div className="flex items-start justify-between gap-4 px-5 py-3.5">
                    {/* Left: title + meta */}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <a
                        className="truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
                        href={item.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {item.title} <span className="font-normal text-muted-foreground">(#{item.number})</span>
                      </a>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span>{item.authorLogin}</span>
                        <span>{formatRelativeTime(item.updatedAt)}</span>
                        <span className="text-border">|</span>
                        <FeedCommentCount count={item.commentCount} authors={item.commentAuthors} />
                      </div>
                    </div>

                    {/* Right: labels + stats */}
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <FeedLabels labels={item.labels} />
                      {item.commitCount !== undefined && item.additions !== undefined && item.deletions !== undefined ? (
                        <FeedDiffStats commitCount={item.commitCount} additions={item.additions} deletions={item.deletions} />
                      ) : null}
                    </div>
                  </div>
                  {index < feedState.data.items.length - 1 ? <Separator /> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <AddProjectDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onProjectAdded={handleProjectAdded}
      />
    </section>
  );
}
