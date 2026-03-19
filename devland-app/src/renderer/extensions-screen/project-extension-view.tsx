import { useEffect, useMemo, useRef, useState } from 'react';

import {
  DevlandHostRequestSchema,
  type DevlandHostContext,
  type DevlandHostResponse,
} from '@devlandapp/sdk';
import {
  AlertCircleIcon,
  DownloadIcon,
  ExternalLinkIcon,
  GitPullRequestArrowIcon,
  PuzzleIcon,
  RefreshCwIcon,
} from 'lucide-react';

import { useProjectExtensions } from '@/renderer/extensions-screen/use-project-extensions';
import { useProjectRepoDetailsState } from '@/renderer/projects-shell/use-project-repo';
import { isAbsoluteProjectPath } from '@/renderer/shared/lib/projects';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import { Spinner } from '@/shadcn/components/ui/spinner';

const EXTENSION_ICON_BY_NAME = {
  'git-pull-request': GitPullRequestArrowIcon,
} as const;

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

const statusLabelByType = {
  ready: 'Installed',
  'install-required': 'Install required',
  'update-available': 'Update available',
  error: 'Error',
} as const;

export function ProjectExtensionView({
  extensionId,
}: {
  extensionId: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const repoDetails = useProjectRepoDetailsState();
  const extensions = useProjectExtensions(
    repoDetails.status === 'ready' && isAbsoluteProjectPath(repoDetails.data.path)
      ? repoDetails.data.path
      : null,
  );

  const extension = extensions.byId.get(extensionId) ?? null;
  const ExtensionIcon = extension !== null
    ? EXTENSION_ICON_BY_NAME[extension.tabIcon]
    : GitPullRequestArrowIcon;
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
  }, [extension, extensionContext, extensionId, extensionMessaging]);

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

  const showInstalledFrame =
    extension.entryUrl !== null &&
    (extension.status === 'ready' || extension.status === 'update-available');
  const showInstallPrompt = extension.status === 'install-required';
  const showUpdateAlert = extension.status === 'update-available';
  const canInstallFromGithub = extension.source.kind === 'github';

  return (
    <section className="flex h-full min-h-0 flex-col bg-muted/20 p-3">
      <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-2">
          <ExtensionIcon className="size-4 text-primary" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{extension.tabName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {extension.name === null
                ? extension.requestedVersion === null
                  ? 'Not installed yet'
                  : `Install ${extension.requestedVersion} to open this extension.`
                : `${extension.name} v${extension.version ?? extension.requestedVersion ?? '?'}`}
            </p>
          </div>
        </div>

        <Badge variant={extension.status === 'error' ? 'destructive' : 'outline'}>
          {statusLabelByType[extension.status]}
        </Badge>
      </div>

      {actionError !== null ? (
        <div className="mb-3">
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Extension action failed</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        </div>
      ) : null}

      {showUpdateAlert ? (
        <div className="mb-3">
          <Alert>
            <RefreshCwIcon />
            <AlertTitle>Update available</AlertTitle>
            <AlertDescription>
              Repo config requests v{extension.requestedVersion ?? '?'} while the installed
              copy is v{extension.version ?? '?'}. Update when you are ready.
            </AlertDescription>
          </Alert>
          {canInstallFromGithub ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={isInstalling} onClick={() => void handleInstall()} type="button">
                {isInstalling ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <RefreshCwIcon data-icon="inline-start" />
                )}
                Update extension
              </Button>
              <Button
                nativeButton={false}
                render={
                  <a
                    href={extension.repositoryUrl ?? undefined}
                    rel="noreferrer"
                    target="_blank"
                  />
                }
                variant="outline"
              >
                <ExternalLinkIcon data-icon="inline-start" />
                View repository
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showInstallPrompt ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ExtensionIcon />
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
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-background shadow-sm">
          <iframe
            key={`${extension.id}:${extension.version ?? 'unknown'}:${extension.requestedVersion ?? 'none'}`}
            ref={iframeRef}
            className="h-full w-full border-0 bg-background"
            sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
            src={extension.entryUrl ?? undefined}
            title={extension.tabName}
          />
        </div>
      ) : null}
    </section>
  );
}
