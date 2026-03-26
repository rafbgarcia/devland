import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@tanstack/react-router';

import {
  DevlandHostRequestSchema,
  type DevlandHostContext,
  type DevlandHostResponse,
} from '@devlandapp/sdk';
import {
  AlertCircleIcon,
  DownloadIcon,
  ExternalLinkIcon,
  PuzzleIcon,
} from 'lucide-react';

import { useCodeTargets } from '@/renderer/code-screen/use-code-targets';
import { useCodexSessionActions } from '@/renderer/code-screen/use-codex-sessions';
import { DETACHED_WORKTREE_TARGET_TITLE } from '@/renderer/code-screen/worktree-session';
import { useProjectExtensions } from '@/renderer/extensions-screen/use-project-extensions';
import { useProjectRepoDetailsState } from '@/renderer/projects-shell/use-project-repo';
import { useWorkspaceSession } from '@/renderer/projects-shell/use-workspace-session';
import {
  getProjectTabRoute,
  isAbsoluteProjectPath,
} from '@/renderer/shared/lib/projects';
import { useAppPreferences } from '@/renderer/shared/use-app-preferences';
import {
  rememberCodePane,
  rememberCodeTarget,
  rememberProjectTab,
} from '@/renderer/shared/lib/workspace-view-state';
import { ExtensionTabIcon } from '@/renderer/shared/ui/extension-tab-icon';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Button } from '@/shadcn/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import { Spinner } from '@/shadcn/components/ui/spinner';

const buildExtensionContext = (
  repo: NonNullable<ReturnType<typeof useProjectRepoDetailsState>['data']>,
): DevlandHostContext => ({
  repo: {
    repoId: repo.id,
    projectPath: repo.path,
    isLocal: isAbsoluteProjectPath(repo.path),
    githubSlug: repo.githubSlug,
    owner: repo.owner,
    name: repo.name,
  },
});

const getMessageOrigin = (entryUrl: string | null): { eventOrigin: string | null; targetOrigin: string } | null => {
  if (entryUrl === null) {
    return null;
  }

  const parsedUrl = new URL(entryUrl);

  if (parsedUrl.protocol === 'file:') {
    return {
      eventOrigin: 'null',
      targetOrigin: '*',
    };
  }

  return {
    eventOrigin: parsedUrl.origin,
    targetOrigin: parsedUrl.origin,
  };
};

const postToFrame = (
  iframe: HTMLIFrameElement | null,
  targetOrigin: string,
  message: DevlandHostResponse,
): void => {
  iframe?.contentWindow?.postMessage(message, targetOrigin);
};

export function ProjectExtensionView({
  extensionId,
}: {
  extensionId: string;
}) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const repoDetails = useProjectRepoDetailsState();
  const { updateSession } = useWorkspaceSession();
  const { sendPrompt } = useCodexSessionActions();
  const { preferences } = useAppPreferences();
  const extensions = useProjectExtensions(
    repoDetails.status === 'ready' ? repoDetails.data.path : null,
  );
  const { addWorktreeTarget, updateTarget } = useCodeTargets(
    repoDetails.status === 'ready' ? repoDetails.data.id : '__pending__',
    repoDetails.status === 'ready' ? repoDetails.data.path : '/',
    null,
  );

  const extension = extensions.byId.get(extensionId) ?? null;
  const extensionMessaging = useMemo(
    () => getMessageOrigin(extension?.entryUrl ?? null),
    [extension?.entryUrl],
  );
  const extensionContext = useMemo(
    () =>
      repoDetails.status === 'ready' && repoDetails.data !== null
        ? buildExtensionContext(repoDetails.data)
        : null,
    [repoDetails],
  );

  const createNewCodesSession = useCallback(async (
    prompt: string,
  ): Promise<{ targetId: string; cwd: string }> => {
    if (repoDetails.status !== 'ready' || repoDetails.data === null) {
      throw new Error('Repository context is not ready yet.');
    }

    const trimmedPrompt = prompt.trim();

    if (trimmedPrompt.length === 0) {
      throw new Error('Prompt cannot be empty.');
    }

    const repo = repoDetails.data;
    const worktree = await window.electronAPI.createGitWorktree(repo.path);
    const target = addWorktreeTarget(worktree.cwd, worktree.initialTitle);

    if (worktree.worktreeSetupCommand) {
      void window.electronAPI
        .execTerminalSessionCommand({
          sessionId: target.id,
          cwd: target.cwd,
          command: worktree.worktreeSetupCommand,
        })
        .catch((error) => {
          console.error('Failed to start worktree setup command:', error);
        });
    }

    await sendPrompt(
      target.id,
      target.cwd,
      {
        prompt: trimmedPrompt,
        settings: preferences.codexComposerSettings,
        attachments: [],
      },
      {
        background: true,
        beforeSend: async () => {
          if (target.title !== DETACHED_WORKTREE_TARGET_TITLE) {
            return;
          }

          const suggestion = await window.electronAPI.suggestGitWorktreeBranchName(
            target.cwd,
            trimmedPrompt,
          );

          await window.electronAPI.createGitBranch(target.cwd, suggestion.branch);
          updateTarget(target.id, (currentTarget) => ({
            ...currentTarget,
            title: suggestion.branch,
          }));
        },
      },
    );

    updateSession((currentSession) =>
      rememberCodeTarget(
        rememberCodePane(
          rememberProjectTab(currentSession, repo.id, 'code'),
          repo.id,
          'codex',
        ),
        repo.id,
        target.id,
      ),
    );

    await router.navigate(getProjectTabRoute(repo.id, 'code'));

    return {
      targetId: target.id,
      cwd: target.cwd,
    };
  }, [addWorktreeTarget, repoDetails, router, sendPrompt, updateSession, updateTarget]);

  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      if (
        extension === null ||
        extension.entryUrl === null ||
        extensionMessaging === null ||
        (extension.status !== 'ready' && extension.status !== 'update-available') ||
        event.source !== iframeRef.current?.contentWindow ||
        (extensionMessaging.eventOrigin !== null && event.origin !== extensionMessaging.eventOrigin)
      ) {
        return;
      }

      const parsedRequest = DevlandHostRequestSchema.safeParse(event.data);

      if (!parsedRequest.success) {
        return;
      }

      const request = parsedRequest.data;

      if (request.type === 'devland:ready') {
        return;
      }

      if (extensionContext === null) {
        postToFrame(iframeRef.current, extensionMessaging.targetOrigin, {
          type: 'devland:error',
          requestId: request.requestId,
          message: 'Repository context is not ready yet.',
        });

        return;
      }

      if (request.type === 'devland:get-context') {
        postToFrame(iframeRef.current, extensionMessaging.targetOrigin, {
          type: 'devland:context',
          requestId: request.requestId,
          context: extensionContext,
        });

        return;
      }

      if (request.type === 'devland:new-codes-session') {
        void createNewCodesSession(request.prompt)
          .then((result) => {
            postToFrame(iframeRef.current, extensionMessaging.targetOrigin, {
              type: 'devland:new-codes-session-result',
              requestId: request.requestId,
              result,
            });
          })
          .catch((error: unknown) => {
            postToFrame(iframeRef.current, extensionMessaging.targetOrigin, {
              type: 'devland:error',
              requestId: request.requestId,
              message:
                error instanceof Error
                  ? error.message
                  : 'Could not create a Codex session.',
            });
          });

        return;
      }

      if (request.type === 'devland:get-prompt-request-asset') {
        void window.electronAPI
          .getGitPromptRequestAssetDataUrl({
            repoPath: extensionContext.repo.projectPath,
            ref: request.ref,
            assetPath: request.path,
            mimeType: request.mimeType,
          })
          .then((dataUrl) => {
            postToFrame(iframeRef.current, extensionMessaging.targetOrigin, {
              type: 'devland:prompt-request-asset',
              requestId: request.requestId,
              result: {
                dataUrl,
              },
            });
          })
          .catch((error: unknown) => {
            postToFrame(iframeRef.current, extensionMessaging.targetOrigin, {
              type: 'devland:error',
              requestId: request.requestId,
              message:
                error instanceof Error
                  ? error.message
                  : 'Could not read prompt request asset.',
            });
          });

        return;
      }

      if (request.type !== 'devland:run-command') {
        return;
      }

      void window.electronAPI
        .runExtensionCommand({
          repoPath: extensionContext.repo.projectPath,
          extensionId,
          command: request.command,
          args: request.args,
          cwd: request.cwd ?? null,
        })
        .then((result) => {
          postToFrame(iframeRef.current, extensionMessaging.targetOrigin, {
            type: 'devland:command-result',
            requestId: request.requestId,
            result,
          });
        })
        .catch((error: unknown) => {
          postToFrame(iframeRef.current, extensionMessaging.targetOrigin, {
            type: 'devland:error',
            requestId: request.requestId,
            message:
              error instanceof Error
                ? error.message
                : 'Extension command failed.',
          });
        });
    };

    window.addEventListener('message', handleWindowMessage);

    return () => {
      window.removeEventListener('message', handleWindowMessage);
    };
  }, [
    createNewCodesSession,
    extension,
    extensionContext,
    extensionId,
    extensionMessaging,
  ]);

  useEffect(() => {
    if (
      extension === null
      || extensionContext === null
      || extensionMessaging === null
      || (extension.status !== 'ready' && extension.status !== 'update-available')
    ) {
      return;
    }

    postToFrame(iframeRef.current, extensionMessaging.targetOrigin, {
      type: 'devland:context-changed',
      context: extensionContext,
    });
  }, [extension, extensionContext, extensionMessaging]);

  const handleInstall = async () => {
    if (repoDetails.status !== 'ready' || extension === null) {
      return;
    }

    setIsInstalling(true);
    setActionError(null);

    try {
      await window.electronAPI.installRepoExtension({
        repoPath: repoDetails.data.path,
        extensionId: extension.id,
      });
      await extensions.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Could not install the extension.',
      );
    } finally {
      setIsInstalling(false);
    }
  };

  if (extensions.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner />
          Loading extensions
        </div>
      </div>
    );
  }

  if (extensions.status === 'error') {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Could not open extension</AlertTitle>
          <AlertDescription>{extensions.error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (repoDetails.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner />
          Resolving repository details
        </div>
      </div>
    );
  }

  if (repoDetails.status === 'error') {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>Could not open extension</AlertTitle>
          <AlertDescription>{repoDetails.error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (extension === null) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PuzzleIcon />
            </EmptyMedia>
            <EmptyTitle>Extension not found</EmptyTitle>
            <EmptyDescription>
              Devland could not resolve the requested extension.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const repo = repoDetails.data;

  if (repo === null) {
    return null;
  }

  const showInstalledFrame =
    extension.entryUrl !== null &&
    (extension.status === 'ready' || extension.status === 'update-available');
  const showCloneRequired = extension.status === 'clone-required';
  const showInstallPrompt = extension.status === 'install-required';

  return (
    <section className="flex h-full flex-col">
      {actionError !== null ? (
        <div className="mb-3">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Extension action failed</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {showInstallPrompt ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ExtensionTabIcon iconName={extension.tabIcon} />
              </EmptyMedia>
              <EmptyTitle>Install extension</EmptyTitle>
              <EmptyDescription>
                Devland can install {extension.tabName} from {extension.repositoryUrl ?? 'the configured source'}.
                Review the repository first if you want to inspect the publisher before installing.
              </EmptyDescription>
            </EmptyHeader>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button disabled={isInstalling} onClick={() => void handleInstall()} type="button">
                {isInstalling ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <DownloadIcon data-icon="inline-start" />
                )}
                Install extension
              </Button>
              {extension.repositoryUrl !== null ? (
              <Button
                nativeButton={false}
                render={
                  <a
                    href={extension.repositoryUrl}
                    rel="noreferrer"
                    target="_blank"
                  />
                }
                variant="outline"
              >
                <ExternalLinkIcon data-icon="inline-start" />
                View repository
              </Button>
              ) : null}
            </div>
          </Empty>
        </div>
      ) : null}

      {showCloneRequired ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ExtensionTabIcon iconName={extension.tabIcon} />
              </EmptyMedia>
              <EmptyTitle>Clone repository to use this tab</EmptyTitle>
              <EmptyDescription>
                {extension.tabName} is configured from the repository filesystem, so Devland
                can only open it after this repo is cloned locally.
              </EmptyDescription>
            </EmptyHeader>
            <Button
              type="button"
              onClick={() => {
                void router.navigate(getProjectTabRoute(repo.id, 'code'));
              }}
            >
              <DownloadIcon data-icon="inline-start" />
              Open code tab
            </Button>
          </Empty>
        </div>
      ) : null}

      {extension.status === 'error' ? (
        <div className="flex-1 p-3">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Could not load extension</AlertTitle>
            <AlertDescription>
              {extension.error ?? 'Devland could not resolve this extension.'}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      {showInstalledFrame ? (
        <main className="min-h-0 flex-1">
          <iframe
            key={`${extension.id}:${extension.version ?? 'unknown'}:${extension.requestedVersion ?? 'none'}`}
            ref={iframeRef}
            className="h-full w-full border-0 bg-background"
            sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
            src={extension.entryUrl ?? undefined}
            title={extension.tabName}
          />
        </main>
      ) : null}
    </section>
  );
}
