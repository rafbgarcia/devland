import { useEffect, useMemo, useState } from 'react';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  GitCommitHorizontalIcon,
  LoaderCircleIcon,
  MessageSquareIcon,
  WrenchIcon,
  XIcon,
} from 'lucide-react';

import type { DevlandRepoContext } from '@devlandapp/sdk';

import { getPullRequestReview } from '@/api/pull-request-review';
import { RelativeTime } from '@/components/relative-time';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import type { ProjectPullRequestFeedItem } from '@/types/pull-requests';
import type { PromptRequestNote, PullRequestReviewCommit } from '@/types/review';

type ReviewState =
  | { status: 'loading'; commits: null; title: null; url: null; error: null }
  | { status: 'ready'; commits: PullRequestReviewCommit[]; title: string; url: string; error: null }
  | { status: 'error'; commits: null; title: null; url: null; error: string };

function PromptRequestTranscript({
  note,
}: {
  note: PromptRequestNote;
}) {
  if (note.transcriptEntries.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        No new Codex context was captured since the last checkpoint for this thread.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {note.transcriptEntries.map((entry) => {
        if (entry.kind === 'work') {
          return (
            <div key={entry.id} className="rounded-2xl border border-border bg-card/70 px-4 py-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                <WrenchIcon className="size-3.5" />
                Activity
              </div>
              <div className="flex flex-col gap-2">
                {entry.activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="rounded-xl border border-border/80 bg-background/70 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
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
                ? 'ml-auto rounded-br-md bg-primary/92 text-primary-foreground'
                : 'rounded-bl-md border border-border bg-card/70 text-foreground',
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
            <div className="mt-2 text-sm whitespace-pre-wrap">
              {entry.message.text || (
                entry.message.role === 'assistant' ? '(empty response)' : '(empty prompt)'
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CommitReviewPane({
  commit,
}: {
  commit: PullRequestReviewCommit;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <div className="rounded-2xl border border-border bg-card/70 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{commit.shortSha}</Badge>
          {commit.authorName ? <span>{commit.authorName}</span> : null}
          <RelativeTime value={commit.committedAt} />
        </div>
        <h3 className="mt-3 text-base font-semibold text-foreground">{commit.messageHeadline}</h3>
      </div>

      {commit.note ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <MessageSquareIcon className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Devland context</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{commit.note.settings.model}</Badge>
            <Badge variant="outline">Reasoning {commit.note.settings.reasoningEffort}</Badge>
            <Badge variant="outline">
              Entries {commit.note.checkpoint.transcriptEntryStart}..{commit.note.checkpoint.transcriptEntryEnd}
            </Badge>
            <span>Thread {commit.note.threadId}</span>
          </div>
          <PromptRequestTranscript note={commit.note} />
          <a
            href={commit.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/35 hover:text-primary"
          >
            Open commit on GitHub
            <ExternalLinkIcon className="size-3.5" />
          </a>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card/70 px-4 py-4">
          <p className="text-sm font-medium text-foreground">No Devland context attached</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This commit does not include a Devland note, so review should continue in GitHub.
          </p>
          <a
            href={commit.url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/35 hover:text-primary"
          >
            Review this commit on GitHub
            <ExternalLinkIcon className="size-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}

export function PullRequestReviewDialog({
  repo,
  pr,
  open,
  onClose,
}: {
  repo: DevlandRepoContext;
  pr: ProjectPullRequestFeedItem | null;
  open: boolean;
  onClose: () => void;
}) {
  const [state, setState] = useState<ReviewState>({
    status: 'loading',
    commits: null,
    title: null,
    url: null,
    error: null,
  });
  const [selectedCommitSha, setSelectedCommitSha] = useState<string | null>(null);

  useEffect(() => {
    if (!open || pr === null) {
      return;
    }

    let cancelled = false;

    setState({
      status: 'loading',
      commits: null,
      title: null,
      url: null,
      error: null,
    });

    void getPullRequestReview(repo, pr.number)
      .then((review) => {
        if (cancelled) {
          return;
        }

        setState({
          status: 'ready',
          commits: review.commits,
          title: review.title,
          url: review.url,
          error: null,
        });
        setSelectedCommitSha(review.commits[0]?.sha ?? null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setState({
          status: 'error',
          commits: null,
          title: null,
          url: null,
          error:
            error instanceof Error
              ? error.message
              : 'Could not load pull request review context.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [open, pr, repo]);

  const commits = state.status === 'ready' ? state.commits : [];
  const selectedIndex = commits.findIndex((commit) => commit.sha === selectedCommitSha);
  const selectedCommit = selectedIndex >= 0 ? commits[selectedIndex] ?? null : commits[0] ?? null;
  const selectedCommitPosition = selectedCommit === null ? -1 : commits.findIndex((commit) => commit.sha === selectedCommit.sha);
  const hasPrevious = selectedCommitPosition > 0;
  const hasNext = selectedCommitPosition >= 0 && selectedCommitPosition < commits.length - 1;

  const headerTitle = useMemo(() => {
    if (state.status === 'ready') {
      return state.title;
    }

    return pr?.title ?? 'Review pull request';
  }, [pr, state]);

  if (!open || pr === null) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/75 p-4 backdrop-blur-sm">
      <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-border bg-background shadow-2xl">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <GitCommitHorizontalIcon className="size-3.5" />
                Commit review
                <Badge variant="outline">#{pr.number}</Badge>
              </div>
              <h2 className="mt-2 truncate text-lg font-semibold text-foreground">{headerTitle}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close review dialog"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1">
          {state.status === 'loading' ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Spinner />
                Loading review commits
              </div>
            </div>
          ) : null}

          {state.status === 'error' ? (
            <div className="p-5">
              <Alert variant="destructive">
                <AlertTitle>Could not load review context</AlertTitle>
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            </div>
          ) : null}

          {state.status === 'ready' ? (
            <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)]">
              <div className="border-r border-border bg-card/30">
                <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
                  {commits.length} commit{commits.length === 1 ? '' : 's'}
                </div>
                <div className="flex h-full min-h-0 flex-col overflow-y-auto p-3">
                  {commits.map((commit, index) => (
                    <button
                      key={commit.sha}
                      type="button"
                      onClick={() => setSelectedCommitSha(commit.sha)}
                      className={cn(
                        'rounded-2xl border px-3 py-3 text-left transition-colors',
                        selectedCommit?.sha === commit.sha
                          ? 'border-primary/40 bg-primary/8'
                          : 'border-transparent hover:border-border hover:bg-background/70',
                      )}
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{index + 1}</Badge>
                        <span>{commit.shortSha}</span>
                        <Badge variant={commit.note ? undefined : 'secondary'}>
                          {commit.note ? 'Devland note' : 'GitHub'}
                        </Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">
                        {commit.messageHeadline}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        <RelativeTime value={commit.committedAt} />
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex min-h-0 flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                  <div className="text-xs text-muted-foreground">
                    {selectedCommitPosition >= 0
                      ? `Reviewing commit ${selectedCommitPosition + 1} of ${commits.length}`
                      : 'Select a commit'}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!hasPrevious}
                      onClick={() => {
                        if (selectedCommitPosition > 0) {
                          setSelectedCommitSha(commits[selectedCommitPosition - 1]?.sha ?? null);
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/35 disabled:pointer-events-none disabled:opacity-45"
                    >
                      <ChevronLeftIcon className="size-3.5" />
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={!hasNext}
                      onClick={() => {
                        if (selectedCommitPosition >= 0 && selectedCommitPosition < commits.length - 1) {
                          setSelectedCommitSha(commits[selectedCommitPosition + 1]?.sha ?? null);
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/35 disabled:pointer-events-none disabled:opacity-45"
                    >
                      Next
                      <ChevronRightIcon className="size-3.5" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 p-5">
                  {selectedCommit ? (
                    <CommitReviewPane commit={selectedCommit} />
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
                      <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
                      Select a commit to review.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
