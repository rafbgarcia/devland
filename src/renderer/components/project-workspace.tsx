import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from '@tanstack/react-router';
import { AnimatePresence, Reorder } from 'motion/react';
import {
  CodeIcon,
  FolderOpenIcon,
  GitPullRequestArrowIcon,
  GithubIcon,
  HashIcon,
  MessageSquareDotIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react';

import type { ProjectViewTab, Repo } from '@/ipc/contracts';
import { getProjectLabel, getProjectTabRouteTo, type ProjectTabRouteTo } from '@/renderer/lib/projects';
import { useRepoActions, useRepos } from '@/renderer/hooks/use-repos';
import { useWorkspaceSession } from '@/renderer/hooks/use-workspace-session';
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
import { Spinner } from '@/shadcn/components/ui/spinner';
import { cn } from '@/shadcn/lib/utils';

const VIEW_TABS = [
  { value: 'code', label: 'Code', icon: CodeIcon, to: '/projects/$repoId/code' },
  {
    value: 'pull-requests',
    label: 'Pull requests',
    icon: GitPullRequestArrowIcon,
    to: '/projects/$repoId/pull-requests',
  },
  { value: 'issues', label: 'Issues', icon: MessageSquareDotIcon, to: '/projects/$repoId/issues' },
  { value: 'channels', label: 'Channels', icon: HashIcon, to: '/projects/$repoId/channels' },
] as const satisfies ReadonlyArray<{
  value: ProjectViewTab;
  label: string;
  icon: typeof CodeIcon;
  to: ProjectTabRouteTo;
}>;

function AddProjectDialog({
  open,
  onOpenChange,
  onProjectAdded,
  onSaveRepo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectAdded: (repo: Repo) => void;
  onSaveRepo: (path: string) => Promise<Repo>;
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
      const repo = await onSaveRepo(trimmedValue);

      setRepoInput('');
      setFormError(null);
      onOpenChange(false);
      onProjectAdded(repo);
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

export function ProjectWorkspace({
  activeRepoId,
  activeView,
  headerAccessory,
  children,
}: {
  activeRepoId: string | null;
  activeView: ProjectViewTab;
  headerAccessory?: ReactNode;
  children?: ReactNode;
}) {
  const router = useRouter();
  const repos = useRepos();
  const { addRepo, removeRepo, reorderRepos } = useRepoActions();
  const { session, updateSession } = useWorkspaceSession();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(repos.length === 0);

  useEffect(() => {
    if (repos.length === 0) {
      setIsAddDialogOpen(true);
    }
  }, [repos]);

  useEffect(() => {
    if (
      session.activeRepoId === activeRepoId &&
      session.activeTab === activeView
    ) {
      return;
    }

    updateSession({
      activeRepoId,
      activeTab: activeView,
    });
  }, [activeRepoId, activeView, session, updateSession]);

  const navigateToTab = (
    repoId: string,
    to: ProjectTabRouteTo,
  ) => {
    void router.navigate({
      to,
      params: { repoId },
    });
  };

  const handleRemoveRepo = (repoId: string) => {
    const nextRepos = repos.filter((repo) => repo.id !== repoId);

    if (repoId === activeRepoId) {
      const nextRepoId = nextRepos[0]?.id ?? null;

      if (nextRepoId === null) {
        void router.navigate({ to: '/projects', replace: true });
      } else {
        navigateToTab(nextRepoId, getProjectTabRouteTo(activeView));
      }
    }

    void removeRepo(repoId);
  };

  const handleReorder = (reordered: Repo[]) => {
    void reorderRepos(reordered);
  };

  const handleProjectAdded = (repo: Repo) => {
    navigateToTab(repo.id, getProjectTabRouteTo(activeView));
  };

  if (repos.length === 0) {
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
          onProjectAdded={handleProjectAdded}
          onSaveRepo={addRepo}
        />
      </section>
    );
  }

  return (
    <section className="flex w-full flex-col">
      <Reorder.Group
        axis="x"
        values={repos}
        onReorder={handleReorder}
        className="flex items-end gap-px bg-muted px-2 pt-1.5"
        as="div"
      >
        <AnimatePresence initial={false}>
          {repos.map((repo) => {
            const isActive = repo.id === activeRepoId;

            return (
              <Reorder.Item
                key={repo.id}
                value={repo}
                onClick={() => {
                  navigateToTab(repo.id, getProjectTabRouteTo(activeView));
                }}
                initial={{ opacity: 0, width: 0 }}
                animate={{
                  opacity: 1,
                  width: 'auto',
                  transition: { type: 'spring', bounce: 0, duration: 0.2 },
                }}
                exit={{
                  opacity: 0,
                  width: 0,
                  transition: { type: 'tween', ease: 'easeOut', duration: 0.2 },
                }}
                layout
                className={cn(
                  'group relative flex max-w-50 cursor-default items-center gap-1 overflow-hidden rounded-t-lg px-3 py-1.5 text-[13px]',
                  isActive
                    ? 'bg-card text-foreground shadow-[0_-1px_3px_-1px_rgba(0,0,0,0.08)]'
                    : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground',
                )}
                as="div"
                whileDrag={{ scale: 1.03, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
              >
                <span className="truncate select-none whitespace-nowrap">
                  {getProjectLabel(repo.path)}
                </span>
                <button
                  className={cn(
                    'ml-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm transition-colors',
                    isActive
                      ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      : 'opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRemoveRepo(repo.id);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  type="button"
                >
                  <XIcon className="size-3" />
                </button>
              </Reorder.Item>
            );
          })}
        </AnimatePresence>

        <button
          onClick={() => setIsAddDialogOpen(true)}
          className="mb-0.5 ml-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          type="button"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </Reorder.Group>

      <div className="rounded-b-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5">
          <nav className="-mb-px flex gap-1">
            {VIEW_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.value === activeView;

              return (
                <button
                  key={tab.value}
                  className={cn(
                    'relative flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors',
                    isActive
                      ? 'border-foreground text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => {
                    if (activeRepoId !== null) {
                      navigateToTab(activeRepoId, tab.to);
                    }
                  }}
                  type="button"
                >
                  <Icon className="size-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {headerAccessory ?? <span />}
        </div>

        <div className="min-h-96">{children}</div>
      </div>

      <AddProjectDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onProjectAdded={handleProjectAdded}
        onSaveRepo={addRepo}
      />
    </section>
  );
}
