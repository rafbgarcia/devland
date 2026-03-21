import { ExternalLinkIcon } from 'lucide-react';

import { InvestigateButton } from '@/components/investigate-button';
import { RelativeTime } from '@/components/relative-time';
import { SlidingDetailDrawer } from '@/components/sliding-detail-drawer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { getAuthorLogin } from '@/lib/github';
import type { ProjectIssueFeedItem } from '@/types/issues';

function IssueDetailContent({ issue, slug }: { issue: ProjectIssueFeedItem; slug: string }) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <a
            href={issue.url}
            target="_blank"
            rel="noreferrer"
            className="group/title flex items-start gap-1.5"
          >
            <h2 className="text-base font-semibold leading-snug group-hover/title:underline">
              {issue.title}{' '}
              <span className="font-normal text-muted-foreground">({issue.number})</span>
            </h2>
            <ExternalLinkIcon className="mt-1.5 size-3 shrink-0 text-muted-foreground transition-colors group-hover/title:text-foreground" />
          </a>
          <InvestigateButton slug={slug} issueNumber={issue.number} />
        </div>

        {issue.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {issue.labels.map((label) => (
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
                {issue.author?.avatarUrl && <AvatarImage src={issue.author.avatarUrl} alt="" />}
                <AvatarFallback>{issue.author?.login?.[0] ?? '?'}</AvatarFallback>
              </Avatar>
              {getAuthorLogin(issue.author)}
            </span>
            <RelativeTime value={issue.createdAt} />
          </div>
          {issue.bodyHTML ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none px-3 py-3 [&_img]:max-w-full [&_img]:rounded-md [&_pre]:overflow-x-auto"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: GitHub-sanitized HTML
              dangerouslySetInnerHTML={{ __html: issue.bodyHTML }}
            />
          ) : (
            <p className="px-3 py-3 text-sm italic text-muted-foreground">No description provided.</p>
          )}
        </div>
      </div>

      {issue.comments.length > 0 && (
        <>
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              {issue.commentCount} {issue.commentCount === 1 ? 'comment' : 'comments'}
            </h3>
          </div>
          <div className="flex flex-col gap-3 px-4 pb-4">
            {issue.comments.map((comment) => (
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

export function IssueDetailDrawer({
  issue,
  issueNumber,
  slug,
  onClose,
}: {
  issue: ProjectIssueFeedItem | null;
  issueNumber: number | null;
  slug: string;
  onClose: () => void;
}) {
  return (
    <SlidingDetailDrawer open={issueNumber !== null} onClose={onClose}>
      {issue === null ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-sm text-muted-foreground">
            Issue details are not available in the current feed.
          </p>
        </div>
      ) : (
        <IssueDetailContent issue={issue} slug={slug} />
      )}
    </SlidingDetailDrawer>
  );
}
