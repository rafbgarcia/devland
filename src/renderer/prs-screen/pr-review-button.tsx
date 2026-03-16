import type { ButtonProps } from '@base-ui/react';
import { type VariantProps } from 'class-variance-authority';
import { atom, useSetAtom } from 'jotai';

import { CodeIcon } from 'lucide-react';

import type { ProjectPullRequestFeedItem } from '@/ipc/contracts';
import { usePrReviewGeneration } from '@/renderer/hooks/use-pr-review-generation';
import { useProjectRepoDetailsState } from '@/renderer/hooks/use-project-repo';
import { Button, buttonVariants } from '@/shadcn/components/ui/button';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { cn } from '@/shadcn/lib/utils';

import type { PrReviewDialogPr } from './pr-review-dialog';

export const reviewPrAtom = atom<PrReviewDialogPr | null>(null);

export function PrReviewButton({
  pr,
  className,
  ...buttonProps
}: ButtonProps & VariantProps<typeof buttonVariants> & {
  pr: ProjectPullRequestFeedItem;
}) {
  const setReviewPr = useSetAtom(reviewPrAtom);
  const repoDetails = useProjectRepoDetailsState();
  const repoId = repoDetails.status === 'ready' ? repoDetails.data.id : null;
  const { isGenerating } = usePrReviewGeneration(repoId, pr.number);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setReviewPr({
      number: pr.number,
      title: pr.title,
      additions: pr.additions,
      deletions: pr.deletions,
      commitCount: pr.commitCount,
    });
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        {...buttonProps}
        variant="outline"
        onClick={handleClick}
      >
        <CodeIcon data-icon="inline-start" />
        Review
      </Button>
      {isGenerating && (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Spinner className="size-3" />
          Generating AI review
        </span>
      )}
    </div>
  );
}
