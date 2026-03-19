import { useMemo } from 'react';

import { ClockIcon, FileCodeIcon, SparklesIcon, XIcon } from 'lucide-react';
import Markdown from 'react-markdown';
import { AnimatePresence, motion } from 'motion/react';

import type { PrReview } from '@/ipc/contracts';
import type { DiffCommentAnchor } from '@/lib/diff';
import { DiffFileSection } from '@/renderer/shared/ui/diff/diff-renderer';
import { useDiffRenderFiles, type DiffRenderFile } from '@/renderer/shared/ui/diff/use-diff-render-files';
import { Button } from '@/shadcn/components/ui/button';
import { Spinner } from '@/shadcn/components/ui/spinner';

type LineRange = { start: number; end: number };

function parseRelevantChange(change: string): { filePath: string; lineRange: LineRange | null } {
  const colonIdx = change.lastIndexOf(':');
  if (colonIdx === -1) {
    return { filePath: change, lineRange: null };
  }

  const maybePath = change.slice(0, colonIdx);
  const maybeRange = change.slice(colonIdx + 1);
  const rangeMatch = maybeRange.match(/^(\d+)-(\d+)$/);

  if (!rangeMatch) {
    // Not a valid range, treat the whole string as a file path
    return { filePath: change, lineRange: null };
  }

  return {
    filePath: maybePath,
    lineRange: {
      start: parseInt(rangeMatch[1]!, 10),
      end: parseInt(rangeMatch[2]!, 10),
    },
  };
}

function rowIntersectsRange(row: DiffRenderFile['rows'][number], range: LineRange) {
  if (row.kind === 'hunk') {
    return false;
  }

  const CONTEXT_PADDING = 2;
  const expandedStart = Math.max(1, range.start - CONTEXT_PADDING);
  const expandedEnd = range.end + CONTEXT_PADDING;
  const rowLineNumbers =
    row.kind === 'context'
      ? [row.beforeLineNumber, row.afterLineNumber]
      : row.kind === 'modified'
      ? [row.before.lineNumber, row.after.lineNumber]
      : [row.data.lineNumber];

  return rowLineNumbers.some((lineNumber) =>
    lineNumber >= expandedStart && lineNumber <= expandedEnd,
  );
}

function filterRowsByRange(rows: DiffRenderFile['rows'], range: LineRange) {
  const filteredRows: DiffRenderFile['rows'] = [];
  let pendingHunk: Extract<DiffRenderFile['rows'][number], { kind: 'hunk' }> | null = null;

  for (const row of rows) {
    if (row.kind === 'hunk') {
      pendingHunk = row;
      continue;
    }

    if (!rowIntersectsRange(row, range)) {
      continue;
    }

    if (pendingHunk) {
      filteredRows.push(pendingHunk);
      pendingHunk = null;
    }

    filteredRows.push(row);
  }

  return filteredRows;
}

function ReviewFileDiff({
  repoPath,
  baseRevision,
  headRevision,
  filePath,
  rawDiff,
  lineRange,
  onSubmitComment,
}: {
  repoPath: string;
  baseRevision: string;
  headRevision: string;
  filePath: string;
  rawDiff: string;
  lineRange: LineRange | null;
  onSubmitComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
}) {
  const renderFiles = useDiffRenderFiles({
    rawDiff: { status: 'ready', data: rawDiff },
    context: {
      kind: 'comparison',
      repoPath,
      oldRevision: baseRevision,
      newRevision: headRevision,
    },
  });
  const renderFile = renderFiles[0] ?? null;
  const excerptFile = useMemo(() => {
    if (renderFile === null) {
      return null;
    }

    if (lineRange === null) {
      return renderFile;
    }

    const rows = filterRowsByRange(renderFile.rows, lineRange);

    if (rows.length === 0) {
      return null;
    }

    return {
      ...renderFile,
      rows,
    };
  }, [lineRange, renderFile]);

  if (excerptFile === null) return null;

  const rangeLabel = lineRange ? `:${lineRange.start}-${lineRange.end}` : '';

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
        <FileCodeIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">
          {filePath}
          {rangeLabel && (
            <span className="text-muted-foreground">{rangeLabel}</span>
          )}
        </span>
      </div>
      <div className="overflow-x-auto">
        <DiffFileSection
          file={excerptFile}
          sectionRef={() => {}}
          onSubmitComment={onSubmitComment}
          hideHeader
        />
      </div>
    </div>
  );
}

function ReviewStep({
  step,
  fileDiffs,
  repoPath,
  baseRevision,
  headRevision,
  onSubmitComment,
}: {
  step: PrReview['steps'][number];
  fileDiffs: Record<string, string>;
  repoPath: string;
  baseRevision: string;
  headRevision: string;
  onSubmitComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
}) {
  const changes = useMemo(() => {
    return step.relevantChanges
      .map((change) => {
        const { filePath, lineRange } = parseRelevantChange(change);
        const rawDiff = fileDiffs[filePath];
        if (!rawDiff) return null;
        return { filePath, lineRange, rawDiff, key: change };
      })
      .filter(Boolean) as Array<{
      filePath: string;
      lineRange: LineRange | null;
      rawDiff: string;
      key: string;
    }>;
  }, [step.relevantChanges, fileDiffs]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {step.order}
        </span>
        <div className="prose prose-sm dark:prose-invert max-w-none pt-0.5">
          <Markdown>{step.description}</Markdown>
        </div>
      </div>
      <div className="flex flex-col gap-3 pl-10">
        {changes.map((change) => (
          <ReviewFileDiff
            key={change.key}
            repoPath={repoPath}
            baseRevision={baseRevision}
            headRevision={headRevision}
            filePath={change.filePath}
            rawDiff={change.rawDiff}
            lineRange={change.lineRange}
            onSubmitComment={onSubmitComment}
          />
        ))}
      </div>
    </div>
  );
}

export function PrReviewContent({
  review,
  repoPath,
  baseRevision,
  headRevision,
  onSubmitComment,
}: {
  review: PrReview;
  repoPath: string;
  baseRevision: string;
  headRevision: string;
  onSubmitComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
}) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-8">
      {review.steps.map((step) => (
        <ReviewStep
          key={step.order}
          step={step}
          fileDiffs={review.fileDiffs}
          repoPath={repoPath}
          baseRevision={baseRevision}
          headRevision={headRevision}
          onSubmitComment={onSubmitComment}
        />
      ))}
    </div>
  );
}

type PrReviewMeta = {
  prNumber: number;
  prTitle: string;
  additions: number;
  deletions: number;
  commitCount: number;
};

export type PrReviewOverlayState =
  | { status: 'idle' }
  | ({ status: 'loading' } & PrReviewMeta)
  | ({ status: 'ready'; review: PrReview } & PrReviewMeta)
  | ({ status: 'error'; error: string } & PrReviewMeta);

export function PrReviewOverlay({
  state,
  onClose,
  repoPath,
  baseRevision,
  headRevision,
  onSubmitComment,
}: {
  state: PrReviewOverlayState;
  onClose: () => void;
  repoPath: string;
  baseRevision: string;
  headRevision: string;
  onSubmitComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
}) {
  const isOpen = state.status !== 'idle';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-60 flex flex-col bg-background"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-3">
            <div className="flex items-center gap-3">
              <SparklesIcon className="size-4 text-primary" />
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold">
                  {state.prTitle}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    #{state.prNumber}
                  </span>
                </h2>
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                  <span>{state.commitCount} {state.commitCount === 1 ? 'commit' : 'commits'}</span>
                  <span className="text-green-600">+{state.additions.toLocaleString()}</span>
                  <span className="text-red-500">-{state.deletions.toLocaleString()}</span>
                </span>
                {state.status === 'ready' && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <ClockIcon className="size-3" />
                    {Math.round(state.review.durationMs / 1000)}s
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="size-8 p-0"
            >
              <XIcon className="size-4" />
            </Button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {state.status === 'loading' && (
              <div className="flex flex-1 items-center justify-center py-32">
                <div className="flex flex-col items-center gap-4">
                  <Spinner className="size-5" />
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-sm font-medium text-foreground">
                      Analyzing pull request...
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Codex is reviewing the changes to create an optimal review order
                    </p>
                  </div>
                </div>
              </div>
            )}

            {state.status === 'error' && (
              <div className="flex flex-1 items-center justify-center py-32">
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm text-destructive">{state.error}</p>
                  <Button variant="outline" size="sm" onClick={onClose}>
                    Close
                  </Button>
                </div>
              </div>
            )}

            {state.status === 'ready' && (
              <PrReviewContent
                review={state.review}
                repoPath={repoPath}
                baseRevision={baseRevision}
                headRevision={headRevision}
                onSubmitComment={onSubmitComment}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
