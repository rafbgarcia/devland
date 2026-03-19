import { startTransition, useCallback, useEffect, useRef, useState } from 'react';

import { CodeIcon, SparklesIcon, XIcon } from 'lucide-react';
import { motion, type Variants } from 'motion/react';

import type { PrDiffMetaResult, PrReview } from '@/ipc/contracts';
import type { DiffCommentAnchor } from '@/lib/diff';
import { CodeCloneView } from '@/renderer/projects-shell/code-clone-view';
import { usePrReviewCache } from '@/renderer/prs-screen/use-pr-review-cache';
import { usePrReviewGeneration } from '@/renderer/prs-screen/use-pr-review-generation';
import { isAbsoluteProjectPath } from '@/renderer/shared/lib/projects';
import { Button } from '@/shadcn/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/components/ui/empty';
import { Spinner } from '@/shadcn/components/ui/spinner';
import { RelativeTime } from '@/renderer/shared/ui/relative-time';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shadcn/components/ui/tabs';

import { PrCodeChanges } from './pr-code-changes';
import { PullRequestDiffStats } from './pull-request-diff-stats';
import { PrReviewContent } from './pr-review-overlay';

type AiReviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; review: PrReview; generatedAt: string }
  | { status: 'error'; error: string };

type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: string };

type ReviewSyncState =
  | { status: 'idle' }
  | { status: 'syncing' }
  | { status: 'ready' }
  | { status: 'error'; error: string };

export type PrReviewDialogPr = {
  number: number;
  title: string;
  additions: number;
  deletions: number;
  commitCount: number;
};

const backdropVariants: Variants = {
  open: { opacity: 1, visibility: 'visible' as const },
  closed: {
    opacity: 0,
    transitionEnd: { visibility: 'hidden' as const },
  },
};

const panelVariants: Variants = {
  open: { opacity: 1, scale: 1, visibility: 'visible' as const },
  closed: {
    opacity: 0,
    scale: 0.97,
    transitionEnd: { visibility: 'hidden' as const },
  },
};

/**
 * Wait for animation to finish smoothly.
 */
const PANEL_TRANSITION_DURATION_S = 0.2;
const CONTENT_MOUNT_DELAY_MS = PANEL_TRANSITION_DURATION_S * 1000;

export function PrReviewDialog({
  pr,
  repoId,
  repoPath,
  slug,
  reviewRefsSyncState,
  reviewRefsVersion,
  onRetryReviewRefsSync,
  open,
  onOpenChange,
}: {
  pr: PrReviewDialogPr | null;
  repoId: string;
  repoPath: string;
  slug: string;
  reviewRefsSyncState: ReviewSyncState;
  reviewRefsVersion: number;
  onRetryReviewRefsSync: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [aiReview, setAiReview] = useState<AiReviewState>({ status: 'idle' });
  const [activeTab, setActiveTab] = useState<string>('code-changes');
  const [prMeta, setPrMeta] = useState<AsyncState<PrDiffMetaResult>>({ status: 'idle' });
  const [isContentMounted, setIsContentMounted] = useState(false);
  const requestIdRef = useRef(0);
  const reviewRequestIdRef = useRef(0);
  const activeSnapshotKeyRef = useRef('');
  const loadedReviewRefsVersionRef = useRef<number | null>(null);
  const { cachedReview, setCachedReview } = usePrReviewCache(repoId, pr?.number ?? null);
  const {
    isGenerating: isGeneratingReview,
    setIsGenerating: setIsGeneratingReview,
  } = usePrReviewGeneration(repoId, pr?.number ?? null);

  // Retain last pr so content stays visible during the exit animation
  const retainedPrRef = useRef<PrReviewDialogPr | null>(pr);
  if (pr) retainedPrRef.current = pr;
  const displayPr = pr ?? retainedPrRef.current;

  const isCloned = isAbsoluteProjectPath(repoPath);
  const hasReadyLocalSnapshot =
    prMeta.status === 'ready' && prMeta.data.status === 'ready';
  const [owner = '', name = ''] = slug.split('/');

  const loadLocalSnapshot = useCallback((requestId: number) => {
    if (!pr) {
      return;
    }

    void window.electronAPI
      .getPrDiffMeta(repoPath, pr.number)
      .then((data) => {
        if (requestIdRef.current !== requestId) return;
        setPrMeta((current) => {
          if (
            current.status === 'ready' &&
            current.data.status === 'ready' &&
            data.status !== 'ready'
          ) {
            return current;
          }

          return { status: 'ready', data };
        });
      })
      .catch((error: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setPrMeta((current) => {
          if (current.status === 'ready' && current.data.status === 'ready') {
            return current;
          }

          return {
            status: 'error',
            error: error instanceof Error ? error.message : 'Failed to load local PR snapshot',
          };
        });
      });
  }, [pr, repoPath]);

  useEffect(() => {
    if (!open || !pr || !isCloned) {
      return;
    }

    const snapshotKey = `${repoPath}:${pr.number}`;

    if (activeSnapshotKeyRef.current === snapshotKey) {
      return;
    }

    activeSnapshotKeyRef.current = snapshotKey;
    loadedReviewRefsVersionRef.current = reviewRefsVersion;

    const requestId = ++requestIdRef.current;
    reviewRequestIdRef.current += 1;
    setPrMeta({ status: 'loading' });
    setAiReview(
      cachedReview === null
        ? isGeneratingReview
          ? { status: 'loading' }
          : { status: 'idle' }
        : {
            status: 'ready',
            review: cachedReview.review,
            generatedAt: cachedReview.generatedAt,
          },
    );
    setActiveTab('code-changes');
    loadLocalSnapshot(requestId);
  }, [
    cachedReview,
    isGeneratingReview,
    open,
    pr,
    isCloned,
    repoPath,
    loadLocalSnapshot,
    reviewRefsVersion,
  ]);

  useEffect(() => {
    if (!open || !displayPr) {
      return;
    }

    setIsContentMounted(false);

    const timeoutId = window.setTimeout(() => {
      startTransition(() => {
        setIsContentMounted(true);
      });
    }, CONTENT_MOUNT_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [open, displayPr?.number]);

  useEffect(() => {
    if (!open || !pr || !isCloned) {
      return;
    }

    if (loadedReviewRefsVersionRef.current === reviewRefsVersion) {
      return;
    }

    loadedReviewRefsVersionRef.current = reviewRefsVersion;

    const requestId = ++requestIdRef.current;
    loadLocalSnapshot(requestId);
  }, [open, pr, isCloned, loadLocalSnapshot, reviewRefsVersion]);

  useEffect(() => {
    if (!open || !pr || !isCloned) {
      return;
    }

    if (cachedReview !== null) {
      setAiReview((current) => (
        current.status === 'ready' && current.generatedAt === cachedReview.generatedAt
          ? current
          : {
              status: 'ready',
              review: cachedReview.review,
              generatedAt: cachedReview.generatedAt,
            }
      ));
      return;
    }

    if (isGeneratingReview) {
      setAiReview((current) => (
        current.status === 'ready' || current.status === 'loading'
          ? current
          : { status: 'loading' }
      ));
    }
  }, [cachedReview, isGeneratingReview, open, pr, isCloned]);

  const handleGenerateReview = useCallback(async () => {
    if (!pr || isGeneratingReview) return;
    const reviewRequestId = ++reviewRequestIdRef.current;
    setIsGeneratingReview(true);
    setAiReview({ status: 'loading' });
    try {
      const review = await window.electronAPI.generatePrReview(
        repoPath,
        pr.number,
        pr.title,
      );
      const generatedAt = new Date().toISOString();

      setCachedReview({ review, generatedAt });

      if (reviewRequestIdRef.current === reviewRequestId) {
        setAiReview({ status: 'ready', review, generatedAt });
      }
    } catch (error) {
      if (reviewRequestIdRef.current === reviewRequestId) {
        setAiReview({
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to generate review',
        });
      }
    } finally {
      setIsGeneratingReview(false);
    }
  }, [isGeneratingReview, pr, repoPath, setCachedReview, setIsGeneratingReview]);

  const handleSubmitPrReviewComment = useCallback(async (
    anchor: DiffCommentAnchor,
    body: string,
  ) => {
    if (!pr) {
      throw new Error('Pull request details are not available.');
    }

    await window.electronAPI.createGitHubPrReviewThread({
      owner,
      name,
      prNumber: pr.number,
      path: anchor.path,
      body,
      line: anchor.line,
      side: anchor.side === 'old' ? 'LEFT' : 'RIGHT',
      startLine: anchor.startLine === anchor.endLine ? null : anchor.startLine,
      startSide:
        anchor.startLine === anchor.endLine
          ? null
          : anchor.side === 'old'
          ? 'LEFT'
          : 'RIGHT',
    });
  }, [name, owner, pr]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const resetState = useCallback(() => {
    if (open) return;
    setAiReview({ status: 'idle' });
    setActiveTab('code-changes');
    setPrMeta({ status: 'idle' });
    setIsContentMounted(false);
    activeSnapshotKeyRef.current = '';
    loadedReviewRefsVersionRef.current = null;
    requestIdRef.current += 1;
    reviewRequestIdRef.current += 1;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleClose]);

  const animateState = open && displayPr ? 'open' : 'closed';

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial="closed"
        animate={animateState}
        variants={backdropVariants}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 bg-black/40"
        style={{ visibility: 'hidden' }}
        onClick={handleClose}
      />

      {/* Panel */}
      <motion.div
        role="dialog"
        aria-modal={open}
        aria-label={displayPr?.title}
        initial="closed"
        animate={animateState}
        variants={panelVariants}
        transition={{ duration: PANEL_TRANSITION_DURATION_S, ease: [0.4, 0, 0.2, 1] }}
        onAnimationComplete={resetState}
        className="fixed inset-2 z-50 flex flex-col gap-0 rounded-xl border bg-card p-0 shadow-2xl"
        style={{ visibility: 'hidden' }}
      >
        {displayPr && (
          <>
            {/* Header */}
            <div className="flex shrink-0 flex-row items-center justify-between border-b border-border px-5 py-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold">
                  {displayPr.title}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    #{displayPr.number}
                  </span>
                </h2>
                <PullRequestDiffStats
                  commitCount={displayPr.commitCount}
                  additions={displayPr.additions}
                  deletions={displayPr.deletions}
                />
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <span className="sr-only">Close</span>
                <XIcon className="size-4" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {!isContentMounted ? (
                <Empty className="h-full border-0">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Spinner />
                    </EmptyMedia>
                    <EmptyTitle>Preparing review workspace</EmptyTitle>
                    <EmptyDescription>
                      Loading the interactive review view after the panel animation settles.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : !isCloned ? (
                <CodeCloneView repoId={repoId} slug={slug} />
              ) : (
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
                  <div className="shrink-0 border-b border-border px-5">
                    <TabsList variant="line" className="h-9">
                      <TabsTrigger value="code-changes">
                        <CodeIcon className="size-3.5" />
                        Code changes
                      </TabsTrigger>
                      <TabsTrigger
                        value="ai-review"
                        disabled={aiReview.status !== 'ready'}
                      >
                        <SparklesIcon className="size-3.5" />
                        {aiReview.status === 'ready' ? 'AI Review' : 'AI Review'}
                      </TabsTrigger>
                      {aiReview.status === 'idle' && !isGeneratingReview && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-2 h-7 gap-1.5 text-xs"
                          onClick={handleGenerateReview}
                          disabled={!hasReadyLocalSnapshot}
                        >
                          <SparklesIcon data-icon="inline-start" />
                          {hasReadyLocalSnapshot ? 'Generate AI review' : 'Waiting for local snapshot'}
                        </Button>
                      )}
                      {isGeneratingReview && (
                        <div className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Spinner className="size-3" />
                          Generating AI review...
                        </div>
                      )}
                      {aiReview.status === 'ready' && !isGeneratingReview && (
                        <div className="ml-2 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Generated <RelativeTime value={aiReview.generatedAt} /> in{' '}
                            {Math.round(aiReview.review.durationMs / 1000)}s
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={handleGenerateReview}
                            disabled={!hasReadyLocalSnapshot}
                          >
                            Regenerate AI review
                          </Button>
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

                  <TabsContent
                    value="code-changes"
                    keepMounted
                    className="flex min-h-0 flex-1 overflow-hidden"
                  >
                    <PrCodeChanges
                      repoPath={repoPath}
                      prNumber={displayPr.number}
                      metaState={prMeta}
                      syncState={reviewRefsSyncState}
                      onRetrySync={onRetryReviewRefsSync}
                    />
                  </TabsContent>

                  <TabsContent value="ai-review" keepMounted className="flex-1 overflow-y-auto">
                    {aiReview.status === 'ready' && (
                      <PrReviewContent
                        review={aiReview.review}
                        repoPath={repoPath}
                        baseRevision={
                          prMeta.status === 'ready' && prMeta.data.status === 'ready'
                            ? prMeta.data.baseRevision
                            : 'HEAD'
                        }
                        headRevision={
                          prMeta.status === 'ready' && prMeta.data.status === 'ready'
                            ? prMeta.data.headRevision
                            : 'HEAD'
                        }
                        onSubmitComment={handleSubmitPrReviewComment}
                      />
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}
