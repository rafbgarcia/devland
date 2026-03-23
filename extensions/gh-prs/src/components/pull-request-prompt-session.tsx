import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import {
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileIcon,
  GitCommitHorizontalIcon,
  SparklesIcon,
  WrenchIcon,
  XIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import type { DevlandRepoContext } from '@devlandapp/sdk';

import { getPullRequestReview } from '@/api/pull-request-review';
import { getPromptRequestAsset } from '@/lib/devland';
import { RelativeTime } from '@/components/relative-time';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ProjectPullRequestFeedItem } from '@/types/pull-requests';
import type {
  PromptRequestAttachment,
  PromptRequestNote,
  PullRequestReviewCommit,
} from '@/types/review';

type ReviewState =
  | { status: 'loading'; commits: null; error: null }
  | { status: 'ready'; commits: PullRequestReviewCommit[]; error: null }
  | { status: 'error'; commits: null; error: string };

function AssistantMarkdown({ text }: { text: string }) {
  return (
    <div className="min-w-0">
      <div className="prose prose-sm max-w-none text-foreground prose-headings:font-medium prose-headings:text-foreground prose-p:text-foreground prose-p:leading-7 prose-a:text-primary prose-strong:text-foreground prose-code:rounded-md prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-medium prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:border prose-pre:border-border/50 prose-pre:bg-card prose-pre:px-4 prose-pre:py-3 prose-pre:text-foreground dark:prose-invert">
        <ReactMarkdown
          components={{
            ul: ({ children, ...props }) => (
              <ul className="my-4 flex list-disc flex-col gap-1 pl-5" {...props}>
                {children}
              </ul>
            ),
            ol: ({ children, ...props }) => (
              <ol className="my-4 flex list-decimal flex-col gap-1 pl-5" {...props}>
                {children}
              </ol>
            ),
            blockquote: ({ children, ...props }) => (
              <blockquote
                className="border-l-2 border-border/70 pl-4 text-muted-foreground"
                {...props}
              >
                {children}
              </blockquote>
            ),
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function ImagePreviewDialog({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 cursor-zoom-out"
      onClick={onClose}
    >
      <div
        className="relative"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-background/88 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
          aria-label="Close preview"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

function PromptRequestAttachmentPreview({
  attachment,
}: {
  attachment: PromptRequestAttachment;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const hasAsset = attachment.asset !== null && attachment.asset !== undefined;
  const [state, setState] = useState<
    | { status: 'idle' | 'loading'; dataUrl: null; error: null }
    | { status: 'ready'; dataUrl: string; error: null }
    | { status: 'error'; dataUrl: null; error: string }
  >({
    status: hasAsset ? 'loading' : 'idle',
    dataUrl: null,
    error: null,
  });

  useEffect(() => {
    if (!hasAsset || !attachment.asset) {
      return;
    }

    let cancelled = false;

    setState({ status: 'loading', dataUrl: null, error: null });

    void getPromptRequestAsset({
      ref: attachment.asset.ref,
      path: attachment.asset.path,
      mimeType: attachment.mimeType,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }

        setState({
          status: 'ready',
          dataUrl: result.dataUrl,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setState({
          status: 'error',
          dataUrl: null,
          error: error instanceof Error ? error.message : 'Could not load image.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [attachment.asset, attachment.mimeType, hasAsset]);

  return (
    <div className="flex w-[132px] flex-col gap-2 overflow-hidden rounded-xl border border-border/70 bg-background/60 p-2">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted/30">
        {state.status === 'ready' ? (
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="size-full cursor-zoom-in"
            aria-label={`Preview ${attachment.name}`}
          >
            <img
              src={state.dataUrl}
              alt={attachment.name}
              className="size-full object-cover"
            />
          </button>
        ) : !hasAsset ? (
          <div className="flex flex-col items-center gap-1 px-2 text-center text-[11px] text-muted-foreground">
            <FileIcon className="size-4" />
            No preview
          </div>
        ) : state.status === 'error' ? (
          <div className="px-2 text-center text-[11px] text-muted-foreground">
            Image unavailable
          </div>
        ) : (
          <Spinner />
        )}
      </div>
      <div>
        <p className="truncate text-[11px] font-medium text-foreground">{attachment.name}</p>
        <p className="text-[10px] text-muted-foreground">
          {Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB
        </p>
        {state.status === 'error' ? (
          <p className="mt-1 text-[10px] text-destructive">{state.error}</p>
        ) : null}
      </div>

      {state.status === 'ready' ? (
        <ImagePreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)}>
          <img
            src={state.dataUrl}
            alt={attachment.name}
            className="max-h-[92vh] max-w-[92vw] rounded-xl object-contain"
          />
        </ImagePreviewDialog>
      ) : null}
    </div>
  );
}

function TranscriptMessages({ note }: { note: PromptRequestNote }) {
  if (note.transcriptEntries.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        No conversation context captured for this commit.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {note.transcriptEntries.map((entry) => {
        if (entry.kind === 'work') {
          const filePaths = entry.activities.flatMap((a) => a.filePaths ?? []);
          const uniqueFiles = [...new Set(filePaths)];

          return (
            <div
              key={entry.id}
              className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
            >
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <WrenchIcon className="size-3" />
                <span>
                  {entry.activities.length} tool{' '}
                  {entry.activities.length === 1 ? 'call' : 'calls'}
                </span>
              </div>
              {entry.activities.map((activity) => (
                <span
                  key={activity.id}
                  className="text-xs text-muted-foreground"
                >
                  {activity.label}
                  {activity.detail ? ` — ${activity.detail}` : ''}
                </span>
              ))}
              {uniqueFiles.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {uniqueFiles.map((filePath) => (
                    <span
                      key={filePath}
                      className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                    >
                      <FileIcon className="size-2.5" />
                      {filePath.split('/').pop()}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        }

        const isUser = entry.message.role === 'user';

        return (
          <div
            key={entry.id}
            className={cn(
              'max-w-[90%] rounded-xl px-3 py-2.5',
              isUser
                ? 'ml-auto rounded-br-sm bg-primary/90 text-primary-foreground'
                : 'rounded-bl-sm border border-border bg-card/70 text-foreground',
            )}
          >
            <span className="text-[10px] font-medium uppercase tracking-wider opacity-60">
              {isUser ? 'User' : 'Assistant'}
            </span>
            {entry.message.attachments.length > 0 && (
              <p className="mt-1 text-[11px] opacity-70">
                Attached: {entry.message.attachments.map((a) => a.name).join(', ')}
              </p>
            )}
            {isUser ? (
              <div className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
                {entry.message.text || '(empty prompt)'}
              </div>
            ) : (
              <div className="mt-1 text-sm leading-relaxed">
                <AssistantMarkdown text={entry.message.text || '(empty response)'} />
              </div>
            )}
            {entry.message.attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {entry.message.attachments.map((attachment, index) => (
                  <PromptRequestAttachmentPreview
                    key={`${attachment.name}:${attachment.sizeBytes}:${index}`}
                    attachment={attachment}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CommitRow({ commit }: { commit: PullRequestReviewCommit }) {
  const [expanded, setExpanded] = useState(false);
  const hasNote = commit.note !== null;

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => {
          if (hasNote) setExpanded((prev) => !prev);
        }}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
          hasNote ? 'hover:bg-muted/40 cursor-default' : 'opacity-60 cursor-default',
        )}
      >
        <div className="flex size-5 shrink-0 items-center justify-center">
          {hasNote ? (
            expanded ? (
              <ChevronDownIcon className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="size-3.5 text-muted-foreground" />
            )
          ) : (
            <GitCommitHorizontalIcon className="size-3.5 text-muted-foreground/50" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {commit.messageHeadline}
            </span>
            {hasNote && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <SparklesIcon className="size-3 shrink-0 text-primary/70" />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Codex-assisted commit
                  {commit.note?.settings
                    ? ` · ${commit.note.settings.model} · reasoning ${commit.note.settings.reasoningEffort}`
                    : ''}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{commit.shortSha}</span>
            {commit.authorName && <span>{commit.authorName}</span>}
            <RelativeTime value={commit.committedAt} />
          </div>
        </div>

        <a
          href={commit.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="View on GitHub"
        >
          <ExternalLinkIcon className="size-3" />
        </a>
      </button>

      {hasNote && expanded && commit.note && (
        <div className="border-t border-border/50 bg-muted/10 px-4 py-4 pl-12">
          <TranscriptMessages note={commit.note} />
        </div>
      )}
    </div>
  );
}

export function PullRequestPromptSession({
  repo,
  pr,
}: {
  repo: DevlandRepoContext;
  pr: ProjectPullRequestFeedItem;
}) {
  const [state, setState] = useState<ReviewState>({
    status: 'loading',
    commits: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    setState({ status: 'loading', commits: null, error: null });

    void getPullRequestReview(repo, pr.number)
      .then((review) => {
        if (cancelled) return;
        setState({ status: 'ready', commits: review.commits, error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          status: 'error',
          commits: null,
          error: error instanceof Error ? error.message : 'Could not load commits.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [repo, pr.number]);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Spinner />
          Loading commits
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>Could not load prompt session</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const commitsWithNotes = state.commits.filter((c) => c.note !== null);

  return (
    <div className="flex-1 overflow-y-auto">
      {commitsWithNotes.length === 0 && (
        <div className="px-4 pt-4 pb-2">
          <p className="text-sm text-muted-foreground">
            No Codex context found for any commit in this PR.
          </p>
        </div>
      )}
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
        <span>
          {state.commits.length} commit{state.commits.length === 1 ? '' : 's'}
        </span>
        {commitsWithNotes.length > 0 && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <SparklesIcon className="size-3 text-primary/70" />
              {commitsWithNotes.length} with Codex context
            </span>
          </>
        )}
      </div>
      <div>
        {state.commits.map((commit) => (
          <CommitRow key={commit.sha} commit={commit} />
        ))}
      </div>
    </div>
  );
}
