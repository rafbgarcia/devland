import { useEffect, useMemo, useState } from 'react';

import { LayersIcon } from 'lucide-react';

import type { PrDiffMetaResult } from '@/ipc/contracts';
import type { AsyncState } from '@/renderer/shared/ui/diff/diff-types';
import { getParsedDiffFiles } from '@/renderer/shared/ui/diff/parsed-diff-files';
import { useDiffRenderFiles } from '@/renderer/shared/ui/diff/use-diff-render-files';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '@/shadcn/components/ui/alert';
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

import { PrDiffViewport } from './pr-diff-viewport';
import { usePrDiffData } from './use-pr-diff-data';

type ReviewSyncState =
  | { status: 'idle' }
  | { status: 'syncing' }
  | { status: 'ready' }
  | { status: 'error'; error: string };

export function PrCodeChanges({
  repoPath,
  prNumber,
  metaState,
  syncState,
  onRetrySync,
}: {
  repoPath: string;
  prNumber: number;
  metaState: AsyncState<PrDiffMetaResult>;
  syncState: ReviewSyncState;
  onRetrySync: () => void;
}) {
  const {
    selection,
    rawDiff,
    diffContext,
    handleSelectCommit,
    handleSelectAll,
  } = usePrDiffData({
    repoPath,
    prNumber,
    metaState,
  });
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const highlightPaths = useMemo(
    () => selectedFilePath === null ? [] : [selectedFilePath],
    [selectedFilePath],
  );
  const sidebarFiles = useMemo(
    () =>
      rawDiff.status !== 'ready'
        ? []
        : [...getParsedDiffFiles(rawDiff.data)]
            .sort((left, right) => left.displayPath.localeCompare(right.displayPath))
            .map((file) => ({
              path: file.displayPath,
              status: file.status,
              additions: file.additions,
              deletions: file.deletions,
            })),
    [rawDiff],
  );
  const renderFiles = useDiffRenderFiles({
    rawDiff,
    context:
      diffContext === null
        ? null
        : diffContext.kind === 'comparison'
        ? {
            kind: 'comparison',
            repoPath,
            oldRevision: diffContext.oldRevision,
            newRevision: diffContext.newRevision,
          }
        : {
            kind: 'commit',
            repoPath,
            commitRevision: diffContext.commitRevision,
            parentRevision: diffContext.parentRevision,
          },
    highlightPaths,
  });
  const selectedFile = useMemo(
    () =>
      selectedFilePath === null
        ? null
        : (renderFiles.find((file) => file.path === selectedFilePath) ?? null),
    [renderFiles, selectedFilePath],
  );

  useEffect(() => {
    if (sidebarFiles.length === 0) {
      if (selectedFilePath !== null) {
        setSelectedFilePath(null);
      }
      return;
    }

    if (
      selectedFilePath !== null &&
      sidebarFiles.some((file) => file.path === selectedFilePath)
    ) {
      return;
    }

    setSelectedFilePath(sidebarFiles[0]?.path ?? null);
  }, [selectedFilePath, sidebarFiles]);

  if (metaState.status === 'idle' || metaState.status === 'loading') {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner className="size-4" />
          </EmptyMedia>
          <EmptyTitle>Checking local PR snapshot</EmptyTitle>
          <EmptyDescription>
            Review opens from local refs first, then syncs in the background.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (metaState.status === 'error') {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>Could not read local PR snapshot</EmptyTitle>
          <EmptyDescription>{metaState.error}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" variant="outline" size="sm" onClick={onRetrySync}>
            Retry sync
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (metaState.data.status === 'missing') {
    const isSyncing = syncState.status === 'syncing';

    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {isSyncing ? <Spinner className="size-4" /> : <LayersIcon className="size-4" />}
          </EmptyMedia>
          <EmptyTitle>
            {isSyncing ? 'Syncing local PR snapshot' : 'No local PR snapshot yet'}
          </EmptyTitle>
          <EmptyDescription>{metaState.data.message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {syncState.status === 'error' ? (
            <>
              <p className="text-sm text-muted-foreground">{syncState.error}</p>
              <Button type="button" variant="outline" size="sm" onClick={onRetrySync}>
                Retry sync
              </Button>
            </>
          ) : null}
        </EmptyContent>
      </Empty>
    );
  }

  const { commits, baseBranch, headBranch } = metaState.data;

  if (commits.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">No commits found in this pull request.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      {syncState.status === 'syncing' && (
        <div className="shrink-0 px-4 pt-4">
          <Alert>
            <AlertTitle>Syncing latest PR refs</AlertTitle>
            <AlertDescription>
              Showing the local snapshot while the newest refs are fetched in the background.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {syncState.status === 'error' && (
        <div className="shrink-0 px-4 pt-4">
          <Alert>
            <AlertTitle>Background sync failed</AlertTitle>
            <AlertDescription>{syncState.error}</AlertDescription>
            <AlertAction>
              <Button type="button" variant="outline" size="sm" onClick={onRetrySync}>
                Retry sync
              </Button>
            </AlertAction>
          </Alert>
        </div>
      )}

      <PrDiffViewport
        commits={commits}
        selection={selection}
        onSelectCommit={handleSelectCommit}
        onSelectAll={handleSelectAll}
        baseBranch={baseBranch}
        headBranch={headBranch}
        rawDiff={rawDiff}
        diffFiles={sidebarFiles}
        selectedFilePath={selectedFilePath}
        selectedFile={selectedFile}
        onSelectFile={setSelectedFilePath}
      />
    </div>
  );
}
