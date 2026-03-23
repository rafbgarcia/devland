import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { getRouteApi, useRouter, useRouterState } from '@tanstack/react-router';
import { AnimatePresence, Reorder } from 'motion/react';
import { CodeIcon, FolderOpenIcon, GitCommitHorizontalIcon, PlusIcon, XIcon } from 'lucide-react';

import { CodeTabMenu } from '@/renderer/code-screen/code-tab-menu';
import { ExternalEditorDialog } from '@/renderer/code-screen/external-editor-dialog';
import { MissingGhCli } from '@/renderer/shared/ui/missing-gh-cli';

import type { AppShortcutCommand, ProjectViewTab, Repo } from '@/ipc/contracts';
import {
  getAdjacentProjectTabRepoId,
  getProjectLabel,
  getProjectTabIdFromRouteMatch,
  getProjectTabRoute,
  getProjectTabRepoIdByShortcutSlot,
  isProjectViewTab,
  toProjectExtensionTabId,
  type ProjectTabId,
  isAbsoluteProjectPath,
} from '@/renderer/shared/lib/projects';
import {
  getRememberedCodeTargetId,
  getRememberedProjectTabId,
  rememberProjectTab,
} from '@/renderer/shared/lib/workspace-view-state';
import {
  useAppShortcutCommand,
  useShortcutHintsOpen,
} from '@/renderer/shared/lib/use-app-shortcut-command';
import {
  CODE_SHORTCUT_GROUPS,
  PROJECT_SHORTCUT_GROUP,
} from '@/renderer/shared/lib/shortcut-hints';
import { isRootCodeTargetId } from '@/renderer/shared/lib/workspace-shortcuts';
import { useProjectExtensions } from '@/renderer/extensions-screen/use-project-extensions';
import { ExtensionTabIcon } from '@/renderer/shared/ui/extension-tab-icon';
import { ShortcutHintsOverlay } from '@/renderer/shared/ui/shortcut-hints-overlay';
import { useAppPreferences } from '@/renderer/shared/use-app-preferences';
import { useRepoActions, useRepos } from './use-repos';
import { useProjectRepo } from './use-project-repo';
import { useWorkspaceSession } from './use-workspace-session';
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
  Field,
  FieldError,
  FieldGroup,
} from '@/shadcn/components/ui/field';
import { Input } from '@/shadcn/components/ui/input';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { cn } from '@/shadcn/lib/utils';

const rootRouteApi = getRouteApi('__root__');

const VIEW_TABS = [
  { value: 'code', label: 'Code', icon: CodeIcon },
  { value: 'prompt-requests', label: 'Prompt requests', icon: GitCommitHorizontalIcon },
] as const satisfies ReadonlyArray<{
  value: ProjectViewTab;
  label: string;
  icon: typeof CodeIcon;
}>;

type ProjectWorkspaceTab = {
  key: string;
  label: string;
  icon: ReactNode;
  tabId: ProjectTabId;
};

export function AddProjectDialog({
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
  const { ghCliAvailable } = rootRouteApi.useLoaderData();

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
          <DialogTitle>Add a Git repo</DialogTitle>
          <DialogDescription className="flex items-center gap-1">
            Use absolute path or a{' '}
            {!ghCliAvailable && <MissingGhCli tooltip="Github owner/repo require the gh CLI" />}
            {' '}Github owner/repo
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={Boolean(formError)}>
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
                  placeholder="e.g. /Users/me/repo or owner/repo"
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
  children,
}: {
  activeRepoId: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const repos = useRepos();
  const activeRepo = useProjectRepo();
  const { addRepo, removeRepo, reorderRepos } = useRepoActions();
  const { session, updateSession } = useWorkspaceSession();
  const projectExtensions = useProjectExtensions(
    activeRepo !== null && isAbsoluteProjectPath(activeRepo.path)
      ? activeRepo.path
      : null,
  );
  const activeRouteMatch = useRouterState({
    select: (state) => state.matches.at(-1) ?? null,
  });
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isExternalEditorDialogOpen, setIsExternalEditorDialogOpen] = useState(false);
  const { preferences, setExternalEditorPreference } = useAppPreferences();
  const activeTabId = getProjectTabIdFromRouteMatch({
    fullPath: activeRouteMatch?.fullPath,
    extensionId: (() => {
      const extensionId = (activeRouteMatch?.params as Record<string, unknown> | undefined)?.extensionId;

      return typeof extensionId === 'string' ? extensionId : null;
    })(),
  });
  const repoViewByIdRef = useRef(session.repoViewById);
  const showShortcutHints = useShortcutHintsOpen();

  const hasActiveRepo = activeRepoId !== null;

  const tabs: ProjectWorkspaceTab[] = hasActiveRepo
    ? [
        ...VIEW_TABS.map((tab) => ({
          key: tab.value,
          label: tab.label,
          icon: <tab.icon className="size-3.5" />,
          tabId: tab.value,
        })),
        ...projectExtensions.data.map((extension) => ({
          key: `extension:${extension.id}`,
          label: extension.tabName,
          icon: <ExtensionTabIcon iconName={extension.tabIcon} className="size-3.5" />,
          tabId: toProjectExtensionTabId(extension.id),
        })),
      ]
    : [];

  useEffect(() => {
    repoViewByIdRef.current = session.repoViewById;
  }, [session.repoViewById]);

  const commitRememberedTab = useEffectEvent((repoId: string, tabId: ProjectTabId) => {
    updateSession((currentSession) => {
      const nextSession = rememberProjectTab(currentSession, repoId, tabId);

      repoViewByIdRef.current = nextSession.repoViewById;

      return nextSession;
    });
  });

  useEffect(() => {
    if (activeRepoId !== null) {
      commitRememberedTab(activeRepoId, activeTabId);
    }
  }, [activeRepoId, activeTabId]);

  const navigateToTab = (repoId: string, tabId: ProjectTabId) => {
    commitRememberedTab(repoId, tabId);
    void router.navigate(getProjectTabRoute(repoId, tabId));
  };

  const getRepoSwitchTabId = (repoId: string): ProjectTabId =>
    getRememberedProjectTabId(
      {
        activeRepoId: session.activeRepoId,
        repoViewById: repoViewByIdRef.current,
      },
      repoId,
    );

  const handleAppShortcutCommand = useEffectEvent(
    (command: AppShortcutCommand) => {
      if (repos.length === 0 || activeRepoId === null || isAddDialogOpen) {
        return;
      }

      if (command.type === 'activate-project-tab-by-shortcut-slot') {
        const nextRepoId = getProjectTabRepoIdByShortcutSlot(repos, command.slot);

        if (nextRepoId !== null) {
          navigateToTab(nextRepoId, getRepoSwitchTabId(nextRepoId));
        }

        return;
      }

      if (command.type === 'close-current-tab') {
        const activeCodeTargetId = activeTabId === 'code'
          ? getRememberedCodeTargetId(session, activeRepoId)
          : null;

        if (activeTabId === 'code' && !isRootCodeTargetId(activeRepoId, activeCodeTargetId)) {
          return;
        }

        if (repos.length === 1) {
          void window.electronAPI.closeCurrentWindow();
          return;
        }

        handleRemoveRepo(activeRepoId);
        return;
      }

      if (command.type !== 'cycle-project-tab') {
        return;
      }

      const nextRepoId = getAdjacentProjectTabRepoId(repos, activeRepoId, command.direction);

      if (nextRepoId !== null) {
        navigateToTab(nextRepoId, getRepoSwitchTabId(nextRepoId));
      }
    },
  );

  useAppShortcutCommand(handleAppShortcutCommand);

  const handleRemoveRepo = (repoId: string) => {
    const nextRepos = repos.filter((repo) => repo.id !== repoId);

    if (repoId === activeRepoId) {
      const nextRepoId = nextRepos[0]?.id ?? null;

      if (nextRepoId === null) {
        void router.navigate({ to: '/projects', replace: true });
      } else {
        navigateToTab(nextRepoId, getRepoSwitchTabId(nextRepoId));
      }
    }

    void removeRepo(repoId);
  };

  const handleReorder = (reordered: Repo[]) => {
    void reorderRepos(reordered);
  };

  const handleProjectAdded = (repo: Repo) => {
    navigateToTab(repo.id, activeTabId);
  };

  const shortcutHintGroups = activeTabId === 'code'
    ? [PROJECT_SHORTCUT_GROUP, ...CODE_SHORTCUT_GROUPS]
    : [PROJECT_SHORTCUT_GROUP];

  return (
    <section className="flex h-screen w-full flex-col">
      <div>
        <Reorder.Group
          axis="x"
          values={repos}
          onReorder={handleReorder}
          className="flex shrink-0 items-end gap-px bg-muted px-2 pt-1.5"
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
                    navigateToTab(repo.id, getRepoSwitchTabId(repo.id));
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
                    'group relative flex max-w-50 cursor-default items-center gap-1 overflow-hidden rounded-t-lg px-3 py-1.5 text-xs',
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
      </div>

      <div className="flex min-h-0 flex-1 flex-col border border-border bg-card shadow-sm">
        {tabs.length > 0 && (
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5">
            <nav className="-mb-px flex gap-1">
              {tabs.map((tab) => {
                const isActive = tab.tabId === activeTabId;
                const tabClassName = cn(
                  'relative flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                );

                if (tab.tabId === 'code') {
                  return (
                    <div
                      key={tab.key}
                      className={cn(
                        'relative flex cursor-default items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'border-foreground text-foreground'
                          : 'border-transparent text-muted-foreground hover:text-foreground',
                      )}
                      onClick={() => navigateToTab(activeRepoId!, tab.tabId)}
                    >
                      {tab.icon}
                      {tab.label}
                      <CodeTabMenu
                        preference={preferences.externalEditor}
                        onSelectEditor={setExternalEditorPreference}
                        onConfigureCustomEditor={() => setIsExternalEditorDialogOpen(true)}
                      />
                    </div>
                  );
                }

                return (
                  <button
                    key={tab.key}
                    className={tabClassName}
                    onClick={() => {
                      navigateToTab(activeRepoId!, tab.tabId);
                    }}
                    type="button"
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        )}

        <div
          className={cn(
            'flex-1',
            !isProjectViewTab(activeTabId) ? 'min-h-0 overflow-hidden' : 'overflow-y-auto',
          )}
        >
          {children}
        </div>
      </div>

      <AddProjectDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onProjectAdded={handleProjectAdded}
        onSaveRepo={addRepo}
      />

      <ExternalEditorDialog
        open={isExternalEditorDialogOpen}
        onOpenChange={setIsExternalEditorDialogOpen}
        preference={preferences.externalEditor}
        onSave={setExternalEditorPreference}
      />

      <ShortcutHintsOverlay
        open={showShortcutHints && repos.length > 0 && !isAddDialogOpen}
        groups={shortcutHintGroups}
      />
    </section>
  );
}
