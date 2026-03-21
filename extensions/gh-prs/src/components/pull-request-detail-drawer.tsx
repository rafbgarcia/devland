import {
  ExternalLinkIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
} from 'lucide-react';

import type { ProjectPullRequestFeedItem } from '@/pull-requests/contracts';
import { RelativeTime } from '@/renderer/shared/ui/relative-time';
import { getAuthorLogin } from '@/renderer/shared/lib/github-view';
import { SlidingDetailDrawer } from '@/renderer/shared/ui/sliding-detail-drawer';
import { Avatar, AvatarFallback, AvatarImage } from '@/shadcn/components/ui/avatar';
import { Badge } from '@/shadcn/components/ui/badge';

import { PullRequestDiffStats } from './pull-request-diff-stats';

function PullRequestDetailContent({
  pr,
}: {
  pr: ProjectPullRequestFeedItem;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-1.5">
            {pr.isDraft ? (
              <GitPullRequestDraftIcon className="size-3 shrink-0 text-gray-500" />
            ) : (
              <GitPullRequestIcon className="size-3 shrink-0 text-green-800" />
            )}
            <a
              href={pr.url}
              target="_blank"
              rel="noreferrer"
              className="group/title flex min-w-0 items-center gap-1.5"
            >
              <h2 className="truncate text-base font-semibold leading-snug group-hover/title:underline">
                {pr.title}{' '}
                <span className="font-normal text-muted-foreground">(#{pr.number})</span>
              </h2>
              <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground transition-colors group-hover/title:text-foreground" />
            </a>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-2">
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
            <PullRequestDiffStats
              commitCount={pr.commitCount}
              additions={pr.additions}
              deletions={pr.deletions}
            />
          </div>
        </div>
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
  pr,
  prNumber,
  onClose,
}: {
  pr: ProjectPullRequestFeedItem | null;
  prNumber: number | null;
  onClose: () => void;
}) {
  return (
    <SlidingDetailDrawer open={prNumber !== null} onClose={onClose}>
      {pr === null ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-sm text-muted-foreground">
            Pull request details are not available in the current feed.
          </p>
        </div>
      ) : (
        <PullRequestDetailContent pr={pr} />
      )}
    </SlidingDetailDrawer>
  );
}
