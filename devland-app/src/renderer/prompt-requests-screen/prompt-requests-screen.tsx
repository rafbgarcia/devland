import { useEffect, useMemo, useState } from 'react';

import {
  GitCommitHorizontalIcon,
  LoaderCircleIcon,
  MessageSquareIcon,
  WrenchIcon,
} from 'lucide-react';
import { getPatchFileSummaries } from '@devlandapp/diff-viewer';
import ReactMarkdown from 'react-markdown';

import { dayjs } from '@/lib/dayjs';
import type {
  GitBranchPromptRequests,
  GitPromptRequestCommit,
  GitPromptRequestSnapshot,
} from '@/ipc/contracts';
import { useGitCommitDiff } from '@/renderer/code-screen/use-git-code-changes';
import { useGitDefaultBranch, useGitStatus } from '@/renderer/code-screen/use-git';
import { Badge } from '@/shadcn/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/shadcn/components/ui/dialog';
import { cn } from '@/shadcn/lib/utils';

type PromptRequestsState =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: GitBranchPromptRequests; error: null }
  | { status: 'error'; data: null; error: string };

function SnapshotTranscript({
  snapshot,
}: {
  snapshot: GitPromptRequestSnapshot;
}) {
  if (snapshot.transcriptEntries.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
        No new Codex context was captured since the last checkpoint for this thread.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {snapshot.transcriptEntries.map((entry) => {
        if (entry.kind === 'work') {
          return (
            <div
              key={entry.id}
              className="rounded-2xl border border-border bg-card/60 px-4 py-3"
            >
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <WrenchIcon className="size-3.5" />
                Activity
              </div>
              <div className="flex flex-col gap-2">
                {entry.activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="rounded-xl border border-border/70 bg-background/60 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{activity.label}</p>
                      <Badge variant="outline">{activity.phase}</Badge>
                    </div>
                    {activity.detail ? (
                      <p className="mt-1 text-xs text-muted-foreground">{activity.detail}</p>
                    ) : null}
                    {activity.filePaths && activity.filePaths.length > 0 ? (
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground/80">
                        {activity.filePaths.join(', ')}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div
            key={entry.id}
            className={cn(
              'max-w-[88%] rounded-2xl px-4 py-3',
              entry.message.role === 'user'
                ? 'ml-auto rounded-br-md bg-primary/90 text-primary-foreground'
                : 'rounded-bl-md border border-border bg-card/60 text-foreground',
            )}
          >
            <div className="text-[11px] uppercase tracking-[0.14em] opacity-70">
              {entry.message.role === 'user' ? 'User' : 'Assistant'}
            </div>
            {entry.message.attachments.length > 0 ? (
              <p className="mt-2 text-xs opacity-80">
                Attachments: {entry.message.attachments.map((attachment) => attachment.name).join(', ')}
              </p>
            ) : null}
            <div
              className={cn(
                'mt-2 text-sm whitespace-pre-wrap',
                entry.message.role === 'assistant' && 'prose prose-sm max-w-none dark:prose-invert',
              )}
            >
              {entry.message.role === 'assistant' ? (
                <ReactMarkdown>{entry.message.text || '(empty response)'}</ReactMarkdown>
              ) : (
                entry.message.text || '(empty prompt)'
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CommitDiffSection({
  repoPath,
  commitSha,
}: {
  repoPath: string;
  commitSha: string;
}) {
  const { rawDiff } = useGitCommitDiff({ repoPath, commitSha });
  const parsedFiles = useMemo(
    () => (rawDiff.status === 'ready' ? getPatchFileSummaries(rawDiff.data) : []),
    [rawDiff],
  );

  if (rawDiff.status === 'loading' || rawDiff.status === 'idle') {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" />
        Loading commit diff...
      </div>
    );
  }

  if (rawDiff.status === 'error') {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {rawDiff.error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {parsedFiles.map((file) => (
          <div
            key={`${file.status}:${file.path}`}
            className="rounded-xl border border-border bg-card/60 px-3 py-2 text-xs"
          >
            <p className="font-medium text-foreground">{file.path}</p>
            <p className="text-muted-foreground">
              {file.status} · +{file.additions} / -{file.deletions}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card/70">
        <div className="border-b border-border px-4 py-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Patch
        </div>
        <pre className="overflow-x-auto px-4 py-3 font-mono text-[12px] leading-6 text-foreground">
          {rawDiff.data || '(empty diff)'}
        </pre>
      </div>
    </div>
  );
}

function PromptRequestDetailDialog({
  repoPath,
  commit,
  onOpenChange,
}: {
  repoPath: string;
  commit: GitPromptRequestCommit | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={commit !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-4xl">
        <DialogTitle className="flex items-center gap-2">
          <GitCommitHorizontalIcon className="size-4" />
          {commit ? `${commit.title || commit.shortSha}` : 'Prompt request'}
        </DialogTitle>

        {commit ? (
          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="flex flex-col gap-6 py-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{commit.shortSha}</Badge>
                <span>{commit.authorName}</span>
                <span>·</span>
                <span>{dayjs(commit.authorDate).fromNow()}</span>
                <Badge variant={commit.snapshot ? 'default' : 'secondary'}>
                  {commit.snapshot ? 'Context attached' : 'Diff only'}
                </Badge>
              </div>

              {commit.snapshot ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <MessageSquareIcon className="size-4 text-muted-foreground" />
                    <p className="text-sm font-medium text-foreground">Codex context</p>
                    <Badge variant="outline">
                      {commit.snapshot.checkpoint.transcriptEntryStart}..{commit.snapshot.checkpoint.transcriptEntryEnd}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {commit.snapshot.settings.model} · reasoning {commit.snapshot.settings.reasoningEffort}
                  </p>
                  <SnapshotTranscript snapshot={commit.snapshot} />
                </div>
              ) : null}

              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <GitCommitHorizontalIcon className="size-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Commit diff</p>
                </div>
                <CommitDiffSection repoPath={repoPath} commitSha={commit.sha} />
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function PromptRequestsScreen({
  repoPath,
}: {
  repoPath: string;
}) {
  const defaultBranchState = useGitDefaultBranch(repoPath);
  const statusState = useGitStatus(repoPath);
  const [state, setState] = useState<PromptRequestsState>({
    status: 'loading',
    data: null,
    error: null,
  });
  const [selectedCommitSha, setSelectedCommitSha] = useState<string | null>(null);

  useEffect(() => {
    if (defaultBranchState.status !== 'ready' || statusState.status !== 'ready') {
      return;
    }

    let cancelled = false;

    setState({ status: 'loading', data: null, error: null });

    void window.electronAPI
      .getGitBranchPromptRequests({
        repoPath,
        baseBranch: defaultBranchState.data,
        headBranch: statusState.data.branch,
      })
      .then((data) => {
        if (!cancelled) {
          setState({ status: 'ready', data, error: null });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: 'error',
            data: null,
            error: error instanceof Error ? error.message : 'Failed to load prompt requests.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    defaultBranchState.data,
    defaultBranchState.status,
    repoPath,
    statusState.data,
    statusState.refreshVersion,
    statusState.status,
  ]);

  const commits = state.status === 'ready' ? state.data.commits : [];
  const selectedCommit = commits.find((commit) => commit.sha === selectedCommitSha) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-2">
          <GitCommitHorizontalIcon className="size-4 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Prompt requests</h2>
            <p className="text-sm text-muted-foreground">
              Commit-by-commit Codex context between the base branch and current branch.
            </p>
          </div>
        </div>
        {state.status === 'ready' ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {state.data.baseBranch}..{state.data.headBranch} · {state.data.commits.length} commit
            {state.data.commits.length === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {state.status === 'loading' ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" />
            Loading prompt requests...
          </div>
        ) : null}

        {state.status === 'error' ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {state.error}
          </div>
        ) : null}

        {state.status === 'ready' && commits.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card/60 px-4 py-6 text-sm text-muted-foreground">
            No commits between {state.data.baseBranch} and {state.data.headBranch}.
          </div>
        ) : null}

        {state.status === 'ready' && commits.length > 0 ? (
          <div className="flex flex-col gap-3">
            {commits.map((commit) => (
              <button
                key={commit.sha}
                type="button"
                onClick={() => setSelectedCommitSha(commit.sha)}
                className="rounded-2xl border border-border bg-card/60 px-4 py-4 text-left transition-colors hover:bg-card"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{commit.shortSha}</Badge>
                  <Badge variant={commit.snapshot ? 'default' : 'secondary'}>
                    {commit.snapshot ? 'Context attached' : 'Diff only'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{commit.authorName}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">
                    {dayjs(commit.authorDate).fromNow()}
                  </span>
                </div>

                <p className="mt-3 text-base font-medium text-foreground">
                  {commit.title || commit.shortSha}
                </p>
                {commit.body.trim() ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {commit.body.trim()}
                  </p>
                ) : null}
                {commit.snapshot ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {commit.snapshot.settings.model} · {commit.snapshot.settings.reasoningEffort} · thread {commit.snapshot.threadId} · entries {commit.snapshot.checkpoint.transcriptEntryStart}..{commit.snapshot.checkpoint.transcriptEntryEnd}
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <PromptRequestDetailDialog
        repoPath={repoPath}
        commit={selectedCommit}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCommitSha(null);
          }
        }}
      />
    </div>
  );
}
