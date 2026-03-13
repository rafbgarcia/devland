import { useState } from 'react';

import { ChevronRightIcon, ExternalLinkIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { IssueDetail } from '@/ipc/contracts';
import { useIssueDetail } from '@/renderer/hooks/use-issue-detail';
import { getAuthorLogin } from '@/renderer/lib/github-view';
import { Badge } from '@/shadcn/components/ui/badge';
import { Separator } from '@/shadcn/components/ui/separator';
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

function IssueDetailContent({ issue }: { issue: IssueDetail }) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold leading-snug">
            {issue.title}{' '}
            <span className="font-normal text-muted-foreground">#{issue.number}</span>
          </h2>
          <a
            href={issue.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLinkIcon className="size-4" />
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{getAuthorLogin(issue.author)}</span>
          <RelativeTime value={issue.createdAt} />
          {issue.labels.length > 0 && (
            <span className="inline-flex flex-wrap gap-1">
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
            </span>
          )}
        </div>
      </div>

      <Separator />

      {issue.bodyHTML ? (
        <div
          className="prose prose-sm dark:prose-invert max-w-none px-4 py-4 [&_img]:max-w-full [&_img]:rounded-md [&_pre]:overflow-x-auto"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: GitHub-sanitized HTML
          dangerouslySetInnerHTML={{ __html: issue.bodyHTML }}
        />
      ) : (
        <p className="px-4 py-4 text-sm italic text-muted-foreground">No description provided.</p>
      )}

      {issue.comments.length > 0 && (
        <>
          <Separator />
          <div className="px-4 py-3">
            <h3 className="text-xs font-medium text-muted-foreground">
              {issue.commentCount} {issue.commentCount === 1 ? 'comment' : 'comments'}
            </h3>
          </div>
          {issue.comments.map((comment) => (
            <div key={comment.id} className="border-t border-border px-4 py-3">
              <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {getAuthorLogin(comment.author)}
                </span>
                <RelativeTime value={comment.createdAt} />
              </div>
              <div
                className="prose prose-sm dark:prose-invert max-w-none [&_img]:max-w-full [&_img]:rounded-md [&_pre]:overflow-x-auto"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: GitHub-sanitized HTML
                dangerouslySetInnerHTML={{ __html: comment.bodyHTML }}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function IssueDetailDrawer({
  projectPath,
  issueNumber,
  onClose,
}: {
  projectPath: string;
  issueNumber: number | null;
  onClose: () => void;
}) {
  const detail = useIssueDetail(projectPath, issueNumber);

  return (
    <AnimatePresence>
      {issueNumber !== null && (
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
                  Loading issue details…
                </div>
              </div>
            )}

            {detail.status === 'error' && (
              <div className="flex flex-1 items-center justify-center p-4">
                <p className="text-sm text-destructive">{detail.error}</p>
              </div>
            )}

            {detail.status === 'ready' && <IssueDetailContent issue={detail.data} />}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
