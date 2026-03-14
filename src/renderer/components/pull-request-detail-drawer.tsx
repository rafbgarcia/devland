import { useState } from 'react';

import {
  ChevronRightIcon,
  ExternalLinkIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { PullRequestDetail } from '@/ipc/contracts';
import { usePullRequestDetail } from '@/renderer/hooks/use-pull-request-detail';
import { getAuthorLogin } from '@/renderer/lib/github-view';
import { Avatar, AvatarFallback, AvatarImage } from '@/shadcn/components/ui/avatar';
import { Badge } from '@/shadcn/components/ui/badge';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { RelativeTime } from '@/ui/relative-time';

function CloseBar({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group flex w-10 shrink-0 items-center justify-center text-gray-500 bg-[linear-gradient(to_right,transparent,var(--background))] transition-all hover:backdrop-blur-sm active:bg-muted"
    >
      <span className="sr-only">Close</span>
      <motion.span
        className="inline-flex"
        animate={
          hovered
            ? { x: [0, 4, 0], transition: { repeat: Infinity, duration: 0.8 } }
            : { x: 0 }
        }
      >
        <ChevronRightIcon className="size-4 group-hover:size-5" />
      </motion.span>
    </button>
  );
}

function PullRequestDiffStats({
  commitCount,
  additions,
  deletions,
}: {
  commitCount: number;
  additions: number;
  deletions: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
      <span>
        {commitCount} {commitCount === 1 ? 'commit' : 'commits'}
      </span>
      <span className="text-green-600">+{additions.toLocaleString()}</span>
      <span className="text-red-500">-{deletions.toLocaleString()}</span>
    </span>
  );
}

function PullRequestDetailContent({ pr }: { pr: PullRequestDetail }) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col gap-3 p-4">
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          className="group/title flex items-center gap-1.5"
        >
          <h2 className="text-base font-semibold leading-snug group-hover/title:underline">
            {pr.title}{' '}
            <span className="font-normal text-muted-foreground">(#{pr.number})</span>
          </h2>
          <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground transition-colors group-hover/title:text-foreground" />
        </a>

        <div className="flex items-center gap-2">
          {pr.isDraft ? (
            <Badge variant="outline" className="gap-1 px-2 py-0.5 text-[0.65rem] text-gray-500">
              <GitPullRequestDraftIcon className="size-3" />
              Draft
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 px-2 py-0.5 text-[0.65rem] text-green-700">
              <GitPullRequestIcon className="size-3" />
              Open
            </Badge>
          )}
          <PullRequestDiffStats
            commitCount={pr.commitCount}
            additions={pr.additions}
            deletions={pr.deletions}
          />
        </div>

        {pr.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pr.labels.map((label) => (
              <Badge
                key={label.name}
                variant="outline"
                className="px-2 py-0.5 text-[0.65rem]"
                style={{
                  backgroundColor: `#${label.color}20`,
                  color: `#${label.color}`,
                  border: `1px solid #${label.color}40`,
                }}
              >
                {label.name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pt-1">
        <div className="rounded-lg border border-border bg-muted/30">
          <div className="flex items-center gap-2 rounded-t-lg border-b border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <Avatar size="sm" className="size-5">
                {pr.author?.avatarUrl && <AvatarImage src={pr.author.avatarUrl} alt="" />}
                <AvatarFallback>{pr.author?.login?.[0] ?? '?'}</AvatarFallback>
              </Avatar>
              {getAuthorLogin(pr.author)}
            </span>
            <RelativeTime value={pr.createdAt} />
          </div>
          {pr.bodyHTML ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none px-3 py-3 [&_img]:max-w-full [&_img]:rounded-md [&_pre]:overflow-x-auto"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: GitHub-sanitized HTML
              dangerouslySetInnerHTML={{ __html: pr.bodyHTML }}
            />
          ) : (
            <p className="px-3 py-3 text-sm italic text-muted-foreground">
              No description provided.
            </p>
          )}
        </div>
      </div>

      {pr.comments.length > 0 && (
        <>
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              {pr.commentCount} {pr.commentCount === 1 ? 'comment' : 'comments'}
            </h3>
          </div>
          <div className="flex flex-col gap-3 px-4 pb-4">
            {pr.comments.map((comment) => (
              <div key={comment.id} className="rounded-lg border border-border bg-muted/30">
                <div className="flex items-center gap-2 rounded-t-lg border-b border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <Avatar size="sm" className="size-5">
                      {comment.author?.avatarUrl && <AvatarImage src={comment.author.avatarUrl} alt="" />}
                      <AvatarFallback>{comment.author?.login?.[0] ?? '?'}</AvatarFallback>
                    </Avatar>
                    {getAuthorLogin(comment.author)}
                  </span>
                  <RelativeTime value={comment.createdAt} />
                </div>
                <div
                  className="prose prose-sm dark:prose-invert max-w-none px-3 py-3 [&_img]:max-w-full [&_img]:rounded-md [&_pre]:overflow-x-auto"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: GitHub-sanitized HTML
                  dangerouslySetInnerHTML={{ __html: comment.bodyHTML }}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function PullRequestDetailDrawer({
  prNumber,
  onClose,
}: {
  prNumber: number | null;
  onClose: () => void;
}) {
  const detail = usePullRequestDetail(prNumber);

  return (
    <AnimatePresence>
      {prNumber !== null && (
        <motion.aside
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'tween', duration: 0.15 }}
          className="fixed inset-y-0 right-0 z-50 flex w-[70vw] flex-row shadow-lg"
        >
          <CloseBar onClick={onClose} />

          <div className="flex min-w-0 flex-1 flex-col bg-background">
            {detail.status === 'loading' && (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Spinner />
                  Loading pull request details…
                </div>
              </div>
            )}

            {detail.status === 'error' && (
              <div className="flex flex-1 items-center justify-center p-4">
                <p className="text-sm text-destructive">{detail.error}</p>
              </div>
            )}

            {detail.status === 'ready' && <PullRequestDetailContent pr={detail.data} />}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
