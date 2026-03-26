import { useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { getRouteApi, useRouter, useRouterState } from '@tanstack/react-router';
import { CodeIcon, FolderOpenIcon, PlusIcon } from 'lucide-react';

import { CodeTabMenu } from '@/renderer/code-screen/code-tab-menu';
import { ExternalEditorDialog } from '@/renderer/code-screen/external-editor-dialog';
import { useCodeTargets } from '@/renderer/code-screen/use-code-targets';
import { useGitStatus } from '@/renderer/code-screen/use-git';
import { DETACHED_WORKTREE_TARGET_TITLE } from '@/renderer/code-screen/worktree-session';
import { ExtensionTabMenu } from '@/renderer/extensions-screen/extension-tab-menu';
import { MissingGhCli } from '@/renderer/shared/ui/missing-gh-cli';

import type { AppShortcutCommand, Repo } from '@/ipc/contracts';
import {
  getAdjacentProjectTabRepoId,
  getProjectTabIdFromRouteMatch,
  getProjectTabRoute,
  getProjectTabRepoIdByShortcutSlot,
  isAbsoluteProjectPath,
  isProjectViewTab,
  toProjectExtensionTabId,
  type ProjectTabId,
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
import { useAllProjectExtensions } from '@/renderer/extensions-screen/use-all-project-extensions';
import { ExtensionTabIcon } from '@/renderer/shared/ui/extension-tab-icon';
import { ShortcutHintsOverlay } from '@/renderer/shared/ui/shortcut-hints-overlay';
import { DesktopUpdateButton } from '@/renderer/shared/ui/desktop-update-button';
import { useAppPreferences } from '@/renderer/shared/use-app-preferences';
import { useDesktopUpdate } from '@/renderer/shared/use-desktop-update';
import { buildProjectWindowTitle } from './window-title';
import { useRepoActions, useRepos } from './use-repos';
import { useProjectRepo } from './use-project-repo';
import { useWorkspaceSession } from './use-workspace-session';
import { ProjectDrawer } from './project-drawer';
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
  { value: 'code' as const, label: 'Code', icon: CodeIcon },
];

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
                  aria-label="Project path"
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
  const { addRepo, removeRepo } = useRepoActions();
  const { session, updateSession } = useWorkspaceSession();
  const { getExtensions, refresh: refreshProjectExtensions } = useAllProjectExtensions(repos);
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
  const desktopUpdateState = useDesktopUpdate();
  const { homeDirectory } = rootRouteApi.useLoaderData();
  const activeRepoPath = activeRepo?.path ?? null;
  const rememberedCodeTargetId = activeRepo === null
    ? null
    : getRememberedCodeTargetId(session, activeRepo.id);
  const { activeTarget } = useCodeTargets(
    activeRepo?.id ?? '__pending__',
    activeRepoPath ?? '/',
    rememberedCodeTargetId,
  );
  const localActiveTargetPath = activeRepo !== null && isAbsoluteProjectPath(activeTarget.cwd)
    ? activeTarget.cwd
    : null;
  const activeTargetGitStatus = useGitStatus(
    localActiveTargetPath,
  );
  const activeBranchName = activeTargetGitStatus.status === 'ready'
    ? activeTargetGitStatus.data.branch
    : activeTarget.kind === 'worktree' && activeTarget.title !== DETACHED_WORKTREE_TARGET_TITLE
      ? activeTarget.title
      : null;

  const getTabsForRepo = useCallback(
    (repoId: string) => {
      const repo = repos.find((r) => r.id === repoId);
      const repoPath = repo?.path ?? null;
      const extensions = repoPath !== null ? getExtensions(repoPath) : [];

      return [
        ...VIEW_TABS.map((tab) => ({
          key: tab.value,
          label: tab.label,
          icon: <tab.icon className="size-3.5" />,
          tabId: tab.value as ProjectTabId,
          menu: tab.value === 'code' ? (
            <CodeTabMenu
              preference={preferences.externalEditor}
              onSelectEditor={setExternalEditorPreference}
              onConfigureCustomEditor={() => setIsExternalEditorDialogOpen(true)}
            />
          ) : undefined,
        })),
        ...extensions.map((extension) => ({
          key: `extension:${extension.id}`,
          label: extension.tabName,
          icon: <ExtensionTabIcon iconName={extension.tabIcon} className="size-3.5" />,
          tabId: toProjectExtensionTabId(extension.id),
          disabled: extension.status === 'clone-required',
          disabledReason:
            extension.status === 'clone-required'
              ? 'Clone repository to use this tab.'
              : null,
          menu: repoPath !== null ? (
            <ExtensionTabMenu
              repoPath={repoPath}
              extension={extension}
              onVersionInstalled={() => void refreshProjectExtensions(repoPath)}
            />
          ) : undefined,
        })),
      ];
    },
    [repos, getExtensions, preferences.externalEditor, refreshProjectExtensions, setExternalEditorPreference],
  );

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

  useEffect(() => {
    document.title = buildProjectWindowTitle({
      projectPath: activeRepoPath === null ? null : activeTarget.cwd,
      branchName: activeBranchName,
      homeDirectory,
    });
  }, [activeBranchName, activeRepoPath, activeTarget.cwd, homeDirectory]);

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

  const handleProjectAdded = (repo: Repo) => {
    navigateToTab(repo.id, activeTabId);
  };

  const shortcutHintGroups = activeTabId === 'code'
    ? [PROJECT_SHORTCUT_GROUP, ...CODE_SHORTCUT_GROUPS]
    : [PROJECT_SHORTCUT_GROUP];

  return (
    <section className="flex h-screen w-full flex-col">
      <ProjectDrawer
        repos={repos}
        activeRepoId={activeRepoId}
        activeTabId={activeTabId}
        getTabsForRepo={getTabsForRepo}
        onNavigate={(repoId, tabId) => navigateToTab(repoId, tabId)}
        onRemoveRepo={handleRemoveRepo}
        onAddProject={() => setIsAddDialogOpen(true)}
      />

      <div className="flex min-h-0 flex-1 flex-col bg-card">
        <div
          className={cn(
            'flex-1',
            !isProjectViewTab(activeTabId) ? 'min-h-0 overflow-hidden' : 'overflow-y-auto',
          )}
        >
          {children}
        </div>
      </div>

      <div className="fixed top-2 right-3 z-30">
        <DesktopUpdateButton state={desktopUpdateState} />
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
