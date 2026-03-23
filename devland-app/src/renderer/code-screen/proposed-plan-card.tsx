import { memo, useMemo, useState } from 'react';

import { ChevronDownIcon, PlayIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import {
  buildCollapsedProposedPlanPreviewMarkdown,
  proposedPlanTitle,
  stripDisplayedPlanMarkdown,
} from '@/renderer/code-screen/proposed-plan';
import { Badge } from '@/shadcn/components/ui/badge';
import { Button } from '@/shadcn/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shadcn/components/ui/card';
import { cn } from '@/shadcn/lib/utils';

const MARKDOWN_PROSE_CLASS_NAME = 'prose prose-sm max-w-none text-foreground prose-headings:font-medium prose-headings:text-foreground prose-p:text-foreground prose-p:leading-7 prose-a:text-primary prose-strong:text-foreground prose-code:rounded-md prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-medium prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-pre:overflow-x-auto prose-pre:rounded-xl prose-pre:border prose-pre:border-border/50 prose-pre:bg-card prose-pre:px-4 prose-pre:py-3 prose-pre:text-foreground dark:prose-invert';

export const ProposedPlanCard = memo(function ProposedPlanCard({
  planMarkdown,
  title,
  canImplement,
  onImplement,
}: {
  planMarkdown: string;
  title?: string | null;
  canImplement?: boolean;
  onImplement?: (() => void) | undefined;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const resolvedTitle = title ?? proposedPlanTitle(planMarkdown) ?? 'Proposed plan';
  const expandedMarkdown = useMemo(
    () => stripDisplayedPlanMarkdown(planMarkdown).trim() || planMarkdown.trim(),
    [planMarkdown],
  );
  const collapsedMarkdown = useMemo(
    () => buildCollapsedProposedPlanPreviewMarkdown(planMarkdown, { maxLines: 6 }),
    [planMarkdown],
  );
  const displayMarkdown = isExpanded ? expandedMarkdown : collapsedMarkdown;
  const hasOverflow = collapsedMarkdown !== expandedMarkdown;

  return (
    <Card
      size="sm"
      className="border border-border/70 bg-card/95 shadow-sm ring-1 ring-primary/8 backdrop-blur-xs"
    >
      <CardHeader className="gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">Plan</Badge>
          {canImplement ? <Badge variant="secondary">Ready</Badge> : null}
        </div>
        <CardTitle className="text-lg leading-tight">{resolvedTitle}</CardTitle>
        <CardDescription>
          Review the proposed implementation before continuing.
        </CardDescription>
        {hasOverflow ? (
          <CardAction>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded((current) => !current)}
            >
              <ChevronDownIcon
                data-icon="inline-start"
                className={cn('transition-transform', isExpanded && 'rotate-180')}
              />
              {isExpanded ? 'Collapse' : 'Expand'}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="pt-1">
        <div className={MARKDOWN_PROSE_CLASS_NAME}>
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
            {displayMarkdown}
          </ReactMarkdown>
        </div>
      </CardContent>

      {canImplement || hasOverflow ? (
        <CardFooter className="justify-between gap-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Reply below to refine the plan. Implementing it will switch the next turn back to chat
            mode.
          </p>

          {canImplement && onImplement ? (
            <Button type="button" size="sm" onClick={onImplement}>
              <PlayIcon data-icon="inline-start" />
              Implement plan
            </Button>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
});
