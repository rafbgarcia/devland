import { useCallback, useState } from 'react';

import { CodeIcon, SparklesIcon, XIcon } from 'lucide-react';

import type { PrReview } from '@/ipc/contracts';
import { CodeCloneView } from '@/renderer/components/code-clone-view';
import { isAbsoluteProjectPath } from '@/renderer/lib/projects';
import { Button } from '@/shadcn/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shadcn/components/ui/dialog';
import { Spinner } from '@/shadcn/components/ui/spinner';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shadcn/components/ui/tabs';
import { PrReviewContent } from './pr-review-overlay';

type AiReviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; review: PrReview }
  | { status: 'error'; error: string };

export type PrReviewDialogPr = {
  number: number;
  title: string;
  additions: number;
  deletions: number;
  commitCount: number;
};

export function PrReviewDialog({
  pr,
  repoId,
  repoPath,
  owner,
  name,
  slug,
  open,
  onOpenChange,
}: {
  pr: PrReviewDialogPr | null;
  repoId: string;
  repoPath: string;
  owner: string;
  name: string;
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [aiReview, setAiReview] = useState<AiReviewState>({ status: 'idle' });
  const [activeTab, setActiveTab] = useState<string>('code-changes');

  const isCloned = isAbsoluteProjectPath(repoPath);

  const handleGenerateReview = useCallback(async () => {
    if (!pr) return;
    setAiReview({ status: 'loading' });
    try {
      const review = await window.electronAPI.generatePrReview(
        owner,
        name,
        pr.number,
        repoPath,
      );
      setAiReview({ status: 'ready', review });
      setActiveTab('ai-review');
    } catch (error) {
      setAiReview({
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to generate review',
      });
    }
  }, [pr, owner, name, repoPath]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setAiReview({ status: 'idle' });
      setActiveTab('code-changes');
    }
    onOpenChange(nextOpen);
  };

  if (!pr) return null;

  const aiReviewTabLabel =
    aiReview.status === 'loading'
      ? 'Generating...'
      : aiReview.status === 'ready'
        ? 'AI Review'
        : 'AI Review';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="fixed inset-8 top-8 left-8 z-50 flex max-h-none w-auto max-w-none -translate-x-0 -translate-y-0 flex-col gap-0 rounded-xl border bg-card p-0 shadow-2xl"
      >
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2.5">
            <DialogTitle className="text-sm font-semibold">
              {pr.title}
              <span className="ml-1.5 font-normal text-muted-foreground">
                #{pr.number}
              </span>
            </DialogTitle>
            <PullRequestDiffStats
              commitCount={pr.commitCount}
              additions={pr.additions}
              deletions={pr.deletions}
            />
          </div>
          <DialogClose className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <span className="sr-only">Close</span>
            <XIcon className="size-4" />
          </DialogClose>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {!isCloned ? (
            <CodeCloneView repoId={repoId} slug={slug} />
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
              <div className="border-b border-border px-5">
                <TabsList variant="line" className="h-9">
                  <TabsTrigger value="code-changes">
                    <CodeIcon className="size-3.5" />
                    Code changes
                  </TabsTrigger>
                  <TabsTrigger
                    value="ai-review"
                    disabled={aiReview.status === 'idle' || aiReview.status === 'loading'}
                  >
                    <SparklesIcon className="size-3.5" />
                    {aiReviewTabLabel}
                  </TabsTrigger>
                  {aiReview.status === 'idle' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2 h-7 gap-1.5 text-xs"
                      onClick={handleGenerateReview}
                    >
                      <SparklesIcon className="size-3" />
                      Generate AI review
                    </Button>
                  )}
                  {aiReview.status === 'loading' && (
                    <div className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Spinner className="size-3" />
                      Generating AI review...
                    </div>
                  )}
                  {aiReview.status === 'error' && (
                    <div className="ml-2 flex items-center gap-2">
                      <span className="text-xs text-destructive">{aiReview.error}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleGenerateReview}
                      >
                        Retry
                      </Button>
                    </div>
                  )}
                </TabsList>
              </div>

              <TabsContent value="code-changes" className="flex-1 overflow-y-auto p-5">
                <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                  Code changes will appear here.
                </div>
              </TabsContent>

              <TabsContent value="ai-review" className="flex-1 overflow-y-auto">
                {aiReview.status === 'ready' && (
                  <PrReviewContent review={aiReview.review} />
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
      <span>{commitCount} {commitCount === 1 ? 'commit' : 'commits'}</span>
      <span className="text-green-600">+{additions.toLocaleString()}</span>
      <span className="text-red-500">-{deletions.toLocaleString()}</span>
    </span>
  );
}
