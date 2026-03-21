import { useEffect, useMemo, useRef, useState } from 'react';

import {
  DevlandHostRequestSchema,
  type DevlandHostContext,
  type DevlandHostResponse,
  GhPrsCloneRepoInputSchema,
  GhPrsGetCommitDiffInputSchema,
  GhPrsGetCommitParentInputSchema,
  GhPrsGetGitBlobTextInputSchema,
  GhPrsGetPrDiffInputSchema,
  GhPrsGetPrDiffMetaInputSchema,
  GhPrsGetPullRequestFeedInputSchema,
  GhPrsGetWorkingTreeFileTextInputSchema,
  GhPrsHostMethods,
  GhPrsSyncReviewRefsInputSchema,
  GhPrsGeneratePrReviewInputSchema,
  CreateGitHubPrReviewThreadInputSchema,
  GhIssuesHostMethods,
  GhIssuesGetIssueFeedInputSchema,
} from '@devlandapp/sdk';
import {
  AlertCircleIcon,
  DownloadIcon,
  ExternalLinkIcon,
  GitPullRequestArrowIcon,
  MessageSquareDotIcon,
  PuzzleIcon,
  RefreshCwIcon,
} from 'lucide-react';

import { useProjectExtensions } from '@/renderer/extensions-screen/use-project-extensions';
import { useProjectRepoDetailsState } from '@/renderer/projects-shell/use-project-repo';
import { useRepoActions } from '@/renderer/projects-shell/use-repos';
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
  'gh-issue': MessageSquareDotIcon,
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
  const { updateRepoPath } = useRepoActions();
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

      if (request.type === 'devland:invoke') {
        void (async () => {
          try {
            const result = await (() => {
              switch (request.method) {
                case GhPrsHostMethods.getPullRequestFeed: {
                  const input = GhPrsGetPullRequestFeedInputSchema.parse(request.input);

                  return window.electronAPI.getProjectPullRequests(
                    input.owner,
                    input.name,
                    input.skipCache,
                  );
                }
                case GhPrsHostMethods.syncReviewRefs: {
                  const input = GhPrsSyncReviewRefsInputSchema.parse(request.input);

                  return window.electronAPI
                    .syncRepoReviewRefs(input.repoPath, input.owner, input.name)
                    .then(() => null);
                }
                case GhPrsHostMethods.getPrDiffMeta: {
                  const input = GhPrsGetPrDiffMetaInputSchema.parse(request.input);

                  return window.electronAPI.getPrDiffMeta(input.repoPath, input.prNumber);
                }
                case GhPrsHostMethods.generatePrReview: {
                  const input = GhPrsGeneratePrReviewInputSchema.parse(request.input);

                  return window.electronAPI.generatePrReview(
                    input.repoPath,
                    input.prNumber,
                    input.title,
                  );
                }
                case GhPrsHostMethods.createReviewThread: {
                  const input = CreateGitHubPrReviewThreadInputSchema.parse(request.input);

                  return window.electronAPI.createGitHubPrReviewThread(input);
                }
                case GhPrsHostMethods.getCommitDiff: {
                  const input = GhPrsGetCommitDiffInputSchema.parse(request.input);

                  return window.electronAPI.getCommitDiff(input.repoPath, input.commitSha);
                }
                case GhPrsHostMethods.getPrDiff: {
                  const input = GhPrsGetPrDiffInputSchema.parse(request.input);

                  return window.electronAPI.getPrDiff(input.repoPath, input.prNumber);
                }
                case GhPrsHostMethods.getCommitParent: {
                  const input = GhPrsGetCommitParentInputSchema.parse(request.input);

                  return window.electronAPI.getCommitParent(input.repoPath, input.commitSha);
                }
                case GhPrsHostMethods.getGitBlobText: {
                  const input = GhPrsGetGitBlobTextInputSchema.parse(request.input);

                  return window.electronAPI.getGitBlobText({
                    repoPath: input.repoPath,
                    revision: input.revision,
                    filePath: input.filePath,
                    ...(input.maxBytes === undefined ? {} : { maxBytes: input.maxBytes }),
                  });
                }
                case GhPrsHostMethods.getWorkingTreeFileText: {
                  const input = GhPrsGetWorkingTreeFileTextInputSchema.parse(request.input);

                  return window.electronAPI.getWorkingTreeFileText({
                    repoPath: input.repoPath,
                    filePath: input.filePath,
                    ...(input.maxBytes === undefined ? {} : { maxBytes: input.maxBytes }),
                  });
                }
                case GhPrsHostMethods.cloneRepo: {
                  const input = GhPrsCloneRepoInputSchema.parse(request.input);

                  return window.electronAPI.cloneGithubRepo(input.slug).then((path) => {
                    updateRepoPath(input.repoId, path);

                    return { path };
                  });
                }
                case GhIssuesHostMethods.getIssueFeed: {
                  const input = GhIssuesGetIssueFeedInputSchema.parse(request.input);

                  return window.electronAPI.getProjectIssues(
                    input.owner,
                    input.name,
                    input.skipCache,
                  );
                }
                default:
                  throw new Error(`Unsupported extension host method: ${request.method}`);
              }
            })();

            postToFrame(iframeRef.current, extensionMessaging.targetOrigin, {
              type: 'devland:invoke-result',
              requestId: request.requestId,
              result,
            });
          } catch (error: unknown) {
            postToFrame(iframeRef.current, extensionMessaging.targetOrigin, {
              type: 'devland:error',
              requestId: request.requestId,
              message:
                error instanceof Error
                  ? error.message
                  : 'Extension host call failed.',
            });
          }
        })();

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
  }, [extension, extensionContext, extensionId, extensionMessaging, updateRepoPath]);

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
