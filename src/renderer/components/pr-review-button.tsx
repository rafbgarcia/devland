import { atom, useSetAtom } from 'jotai';

import { CodeIcon } from 'lucide-react';

import type { ProjectPullRequestFeedItem } from '@/ipc/contracts';

import type { PrReviewDialogPr } from './pr-review-dialog';
import { Button, buttonVariants } from '@/shadcn/components/ui/button';
import { ButtonProps } from '@base-ui/react';
import { VariantProps } from 'class-variance-authority';

export const reviewPrAtom = atom<PrReviewDialogPr | null>(null);

export function PrReviewButton({
  pr,
  ...buttonProps
}: ButtonProps & VariantProps<typeof buttonVariants> & {
  pr: ProjectPullRequestFeedItem;
}) {
  const setReviewPr = useSetAtom(reviewPrAtom);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setReviewPr({
      number: pr.number,
      title: pr.title,
      additions: pr.additions,
      deletions: pr.deletions,
      commitCount: pr.commitCount,
    });
  };

  return (
    <Button
      {...buttonProps}
      variant="outline"
      onClick={handleClick}
    >
      <CodeIcon  />
      Review
    </Button>
  );
}
