import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronsUpDownIcon,
  FileCodeIcon,
  MinusIcon,
  PlusIcon,
} from 'lucide-react';

import {
  buildDiffCommentAnchor,
  getCommentableLineNumber,
  type DiffCommentAnchor,
  type DiffCommentSide,
  type DiffSelectionSide,
  type DiffSelectionType,
} from '@/lib/diff';
import {
  getHighlightTokensForLine,
  getIntraLineDiffTokens,
  renderHighlightedText,
} from '@/renderer/shared/ui/diff/render-highlighted-text';
import { Alert, AlertDescription, AlertTitle } from '@/shadcn/components/ui/alert';
import { Button } from '@/shadcn/components/ui/button';
import { Textarea } from '@/shadcn/components/ui/textarea';
import { cn } from '@/shadcn/lib/utils';

import {
  buildDiffRenderExpansionItems,
  DEFAULT_DIFF_EXPANSION_STEP,
  type DiffExpansionAction,
  type DiffExpansionGap,
  type DiffFileExpansionState,
} from './diff-expansion';
import type { DiffRenderFile } from './use-diff-render-files';

const ROW_HEIGHT_PX = 20;
const ROW_BASE_CLASS = 'font-mono text-[12px] leading-[20px]';
const MARKER_CLASS = 'w-5 shrink-0 select-none text-center text-[11px]';
const LINE_NUMBER_BOX_CLASS =
  'shrink-0 select-none border-r border-border/40 bg-muted/35 text-[11px] text-muted-foreground/75';
const LINE_NUMBER_BOX_DUAL_WIDTH_CLASS = 'w-[112px]';
const LINE_NUMBER_INTERACTIVE_CLASS =
  'group/line-number flex h-full w-full items-stretch text-left';
const LINE_NUMBER_CHECK_CLASS = 'flex w-5 shrink-0 items-center justify-center';
const LINE_NUMBER_DUAL_VALUE_CLASS = 'flex-1 px-1.5 text-right tabular-nums';
const LINE_NUMBER_CHANGED_HOVER_CLASS = 'hover:bg-blue-700/40 hover:text-white/60';

type DiffCommentDraft = {
  side: DiffCommentSide;
  startRowIndex: number;
  endRowIndex: number;
  isSelecting: boolean;
  body: string;
  error: string | null;
  isSubmitting: boolean;
};

type CommentRangePosition = 'first' | 'middle' | 'last' | 'only';

type LineSelectionProps = {
  rowIndex: number;
  side: Exclude<DiffSelectionSide, 'all'>;
  selectionType: DiffSelectionType;
  onToggle: () => void;
  onMouseDown?: (() => void) | undefined;
  onMouseEnter?: (() => void) | undefined;
};

const FILE_STATUS_CONFIG: Record<
  DiffRenderFile['status'],
  { letter: string; className: string; dotClassName: string }
> = {
  modified: {
    letter: 'M',
    className: 'text-amber-700',
    dotClassName: 'bg-amber-500',
  },
  added: {
    letter: 'A',
    className: 'text-emerald-700',
    dotClassName: 'bg-emerald-500',
  },
  deleted: {
    letter: 'D',
    className: 'text-rose-700',
    dotClassName: 'bg-rose-500',
  },
  renamed: {
    letter: 'R',
    className: 'text-sky-700',
    dotClassName: 'bg-sky-500',
  },
  copied: {
    letter: 'C',
    className: 'text-sky-700',
    dotClassName: 'bg-sky-500',
  },
  untracked: {
    letter: 'U',
    className: 'text-emerald-700',
    dotClassName: 'bg-emerald-500',
  },
};

function UnifiedLineNumberBox({
  oldLineNumber,
  newLineNumber,
  isChanged = false,
  selection,
}: {
  oldLineNumber: number | null;
  newLineNumber: number | null;
  isChanged?: boolean;
  selection?: LineSelectionProps | undefined;
}) {
  const numbers = (
    <>
      <span className={cn(LINE_NUMBER_DUAL_VALUE_CLASS, 'border-r border-border/30')}>
        {oldLineNumber ?? ''}
      </span>
      <span className={LINE_NUMBER_DUAL_VALUE_CLASS}>
        {newLineNumber ?? ''}
      </span>
    </>
  );

  if (selection === undefined) {
    return (
      <span className={cn(LINE_NUMBER_BOX_CLASS, LINE_NUMBER_BOX_DUAL_WIDTH_CLASS, isChanged && LINE_NUMBER_CHANGED_HOVER_CLASS)}>
        <span className="flex h-full items-stretch">
          <span className={LINE_NUMBER_CHECK_CLASS} />
          {numbers}
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        selection.onMouseDown?.();
      }}
      onMouseEnter={selection.onMouseEnter}
      onClick={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          selection.onToggle();
        }
      }}
      data-diff-selection-target="true"
      data-diff-selection-row-index={selection.rowIndex}
      data-diff-selection-side={selection.side}
      className={cn(
        LINE_NUMBER_BOX_CLASS,
        LINE_NUMBER_INTERACTIVE_CLASS,
        LINE_NUMBER_BOX_DUAL_WIDTH_CLASS,
        selection.selectionType === 'all' && 'bg-blue-700 text-white',
        selection.selectionType === 'partial' && 'bg-blue-700/60 text-white/70',
        selection.selectionType === 'none' && (isChanged ? LINE_NUMBER_CHANGED_HOVER_CLASS : 'hover:bg-muted/60 hover:text-foreground/70'),
      )}
      aria-pressed={selection.selectionType !== 'none'}
    >
      <span className={LINE_NUMBER_CHECK_CLASS}>
        <CheckIcon
          className={cn(
            'size-3',
            selection.selectionType === 'none'
              ? 'opacity-0 group-hover/line-number:opacity-40'
              : 'opacity-100',
          )}
        />
      </span>
      {numbers}
    </button>
  );
}

function findScrollContainer(element: HTMLElement | null) {
  let current = element?.parentElement ?? null;

  while (current) {
    const style = window.getComputedStyle(current);
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function CommentButton({
  onMouseDown,
  onMouseEnter,
}: {
  onMouseDown: () => void;
  onMouseEnter: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        event.preventDefault();
        onMouseDown();
      }}
      onMouseEnter={onMouseEnter}
      className="flex size-[18px] items-center justify-center rounded bg-blue-600 text-white shadow-sm hover:bg-blue-500"
      aria-label="Add diff comment"
    >
      <PlusIcon className="size-3" />
    </button>
  );
}

function InlineCommentComposer({
  lineRangeLabel,
  onCancel,
  onSubmit,
  body,
  error,
  isSubmitting,
  onBodyChange,
}: {
  lineRangeLabel?: string | undefined;
  onCancel: () => void;
  onSubmit: () => void;
  body: string;
  error: string | null;
  isSubmitting: boolean;
  onBodyChange: (body: string) => void;
}) {
  return (
    <div className="my-2 ml-[112px] mr-2 overflow-hidden rounded-lg border border-border bg-muted/30">
      {lineRangeLabel ? (
        <div className="border-b border-border/50 px-3 py-1.5 text-xs text-muted-foreground">
          {lineRangeLabel}
        </div>
      ) : null}
      {error ? (
        <Alert className="m-3 mb-0">
          <AlertTitle>Comment failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2 p-3">
        <Textarea
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
          placeholder="Leave a comment"
          rows={3}
          disabled={isSubmitting}
          className="bg-background/60 text-xs"
          autoFocus
        />
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={isSubmitting || body.trim().length === 0}
          >
            {isSubmitting ? 'Adding…' : 'Add to prompt'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function HunkRow({
  content,
  onToggleSelection,
  expansionGap,
  onExpandGap,
}: {
  content: string;
  onToggleSelection?: (() => void) | undefined;
  expansionGap?: DiffExpansionGap | undefined;
  onExpandGap?: ((action: DiffExpansionAction) => void) | undefined;
}) {
  const isCompactExpansion =
    expansionGap !== undefined &&
    expansionGap.hiddenLineCount <= DEFAULT_DIFF_EXPANSION_STEP;

  return (
    <div
      className={cn(
        'flex border-y border-border/50 bg-muted/70',
        onToggleSelection && 'cursor-pointer hover:bg-muted',
      )}
      onClick={onToggleSelection}
    >
      <div className={cn(LINE_NUMBER_BOX_CLASS, LINE_NUMBER_BOX_DUAL_WIDTH_CLASS, 'flex shrink-0 items-stretch')}>
        {expansionGap ? (
          isCompactExpansion ? (
            <button
              type="button"
              className="flex flex-1 items-center justify-center hover:bg-muted/80 hover:text-foreground"
              onClick={(event) => {
                event.stopPropagation();
                onExpandGap?.('all');
              }}
              aria-label="Expand all"
            >
              <ChevronsUpDownIcon className="size-3" />
            </button>
          ) : (
            <div className="flex flex-1 flex-col">
              {expansionGap.canExpandDown ? (
                <button
                  type="button"
                  className="flex h-[20px] items-center justify-center hover:bg-muted/80 hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    onExpandGap?.('down');
                  }}
                  aria-label="Expand upward"
                >
                  <ChevronUpIcon className="size-3" />
                </button>
              ) : null}
              {expansionGap.canExpandUp ? (
                <button
                  type="button"
                  className="flex h-[20px] items-center justify-center hover:bg-muted/80 hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    onExpandGap?.('up');
                  }}
                  aria-label="Expand downward"
                >
                  <ChevronDownIcon className="size-3" />
                </button>
              ) : null}
            </div>
          )
        ) : (
          <span className="block w-full" />
        )}
      </div>
      <div className="px-4 py-1 font-mono text-[12px] text-muted-foreground">
        {content}
      </div>
    </div>
  );
}

function UnifiedLine({
  oldLineNumber,
  newLineNumber,
  marker,
  content,
  className,
  isChanged = false,
  selection,
  commentButton,
  commentHighlighted = false,
  commentRangePosition,
  onCommentLaneEnter,
}: {
  oldLineNumber: number | null;
  newLineNumber: number | null;
  marker: string;
  content: ReactNode;
  className?: string;
  isChanged?: boolean;
  selection?: LineSelectionProps | undefined;
  commentButton?: ReactNode;
  commentHighlighted?: boolean;
  commentRangePosition?: CommentRangePosition | undefined;
  onCommentLaneEnter?: (() => void) | undefined;
}) {
  return (
    <div className="flex">
      <div
        className={cn(
          'group/column flex-1',
          commentHighlighted && 'bg-blue-500/8',
          className,
        )}
        onMouseEnter={onCommentLaneEnter}
      >
        <div className={cn('relative flex', ROW_BASE_CLASS)}>
          {/* Hover-only gutter button (no active selection) */}
          {commentButton && !commentRangePosition ? (
            <span className="absolute left-[112px] top-0 z-20 flex h-full w-5 items-center justify-center opacity-0 group-hover/column:opacity-100">
              {commentButton}
            </span>
          ) : null}
          {/* Active selection: connector line + button on first/last/only */}
          {commentRangePosition ? (
            <span className="absolute left-[112px] top-0 z-20 flex h-full w-5 items-center justify-center">
              {commentRangePosition !== 'only' ? (
                <span
                  className={cn(
                    'absolute left-1/2 w-0.5 -translate-x-1/2 bg-blue-500',
                    commentRangePosition === 'first' && 'top-1/2 bottom-0',
                    commentRangePosition === 'middle' && 'inset-y-0',
                    commentRangePosition === 'last' && 'top-0 bottom-1/2',
                  )}
                />
              ) : null}
              {commentRangePosition !== 'middle' && commentButton ? commentButton : null}
            </span>
          ) : null}
          <UnifiedLineNumberBox
            oldLineNumber={oldLineNumber}
            newLineNumber={newLineNumber}
            isChanged={isChanged}
            selection={selection}
          />
          <span className={MARKER_CLASS}>{marker}</span>
          <span className="relative flex-1">
            <span className="diff-syntax whitespace-pre px-2">
              {content}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function ExpansionControlRow({
  gap,
  onExpand,
}: {
  gap: DiffExpansionGap;
  onExpand: (action: DiffExpansionAction) => void;
}) {
  const isCompactExpansion = gap.hiddenLineCount <= DEFAULT_DIFF_EXPANSION_STEP;

  return (
    <div className="flex border-y border-border/50 bg-muted/45">
      <div className="flex shrink-0 flex-col">
        {isCompactExpansion ? (
            <button
              type="button"
              className={cn(
                LINE_NUMBER_BOX_CLASS,
                LINE_NUMBER_BOX_DUAL_WIDTH_CLASS,
                'flex h-[20px] items-center justify-center hover:bg-muted/80 hover:text-foreground',
              )}
            onClick={() => onExpand('all')}
            aria-label="Expand all"
          >
            <ChevronsUpDownIcon className="size-3" />
          </button>
        ) : (
          <>
            {gap.canExpandDown ? (
                <button
                  type="button"
                  className={cn(
                    LINE_NUMBER_BOX_CLASS,
                    LINE_NUMBER_BOX_DUAL_WIDTH_CLASS,
                    'flex h-[20px] items-center justify-center hover:bg-muted/80 hover:text-foreground',
                  )}
                onClick={() => onExpand('down')}
                aria-label="Expand upward"
              >
                <ChevronUpIcon className="size-3" />
              </button>
            ) : null}
            {gap.canExpandUp ? (
                <button
                  type="button"
                  className={cn(
                    LINE_NUMBER_BOX_CLASS,
                    LINE_NUMBER_BOX_DUAL_WIDTH_CLASS,
                    'flex h-[20px] items-center justify-center hover:bg-muted/80 hover:text-foreground',
                  )}
                onClick={() => onExpand('up')}
                aria-label="Expand downward"
              >
                <ChevronDownIcon className="size-3" />
              </button>
            ) : null}
          </>
        )}
      </div>
      <span className="flex min-w-0 items-center px-2 font-mono text-[11px] text-muted-foreground">
        {gap.hiddenLineCount} hidden {gap.hiddenLineCount === 1 ? 'line' : 'lines'}
      </span>
    </div>
  );
}

const HUNK_GUTTER_CONTAINER_CLASS =
  'relative w-7 shrink-0 border-r border-border/30 select-none';
const HUNK_GUTTER_BUTTON_CLASS = 'flex w-full items-center justify-center';

function getHunkSelectionClassName(selectionType: DiffSelectionType) {
  return cn(
    selectionType === 'all' && 'bg-blue-700 text-white',
    selectionType === 'partial' && 'bg-blue-700/60 text-white/70',
    selectionType === 'none' && 'text-muted-foreground/40 hover:bg-blue-700/40 hover:text-white/60',
  );
}

function HunkSelectionGutter({
  selectionType,
  onClick,
  heightPx,
}: {
  selectionType: DiffSelectionType;
  onClick?: (() => void) | undefined;
  heightPx?: number | undefined;
}) {
  const resolvedHeightPx = heightPx ?? ROW_HEIGHT_PX;

  return (
    <div className={HUNK_GUTTER_CONTAINER_CLASS}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        className={cn(
          HUNK_GUTTER_BUTTON_CLASS,
          'absolute inset-x-0 top-0 z-10 cursor-pointer',
          getHunkSelectionClassName(selectionType),
        )}
        style={{ height: `${resolvedHeightPx}px` }}
        aria-label="Toggle change group selection"
      >
        {selectionType === 'partial' ? (
          <MinusIcon className="size-3" />
        ) : (
          <CheckIcon
            className={cn(
              'size-3',
              selectionType === 'none' ? 'opacity-0 group-hover:opacity-40' : 'opacity-100',
            )}
          />
        )}
      </button>
    </div>
  );
}

function EmptyHunkGutter({
  selectionType,
}: {
  selectionType?: DiffSelectionType | undefined;
}) {
  return (
    <span
      className={cn(
        HUNK_GUTTER_CONTAINER_CLASS,
        selectionType !== undefined && selectionType !== 'none' && getHunkSelectionClassName(selectionType),
      )}
    />
  );
}

function UnifiedContextRow({
  file,
  row,
  afterCommentButton,
  afterCommentHighlighted = false,
  afterCommentRangePosition,
  onAfterCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'context' }>;
  afterCommentButton?: ReactNode;
  afterCommentHighlighted?: boolean;
  afterCommentRangePosition?: CommentRangePosition | undefined;
  onAfterCommentLaneEnter?: (() => void) | undefined;
}) {
  const oldTokens = getHighlightTokensForLine(row.beforeLineNumber, file.syntaxTokens?.oldTokens);
  const newTokens = getHighlightTokensForLine(row.afterLineNumber, file.syntaxTokens?.newTokens);

  return (
    <UnifiedLine
      oldLineNumber={row.beforeLineNumber}
      newLineNumber={row.afterLineNumber}
      marker=""
      content={renderHighlightedText(row.content, [newTokens ?? oldTokens])}
      commentButton={afterCommentButton}
      commentHighlighted={afterCommentHighlighted}
      commentRangePosition={afterCommentRangePosition}
      onCommentLaneEnter={onAfterCommentLaneEnter}
    />
  );
}

function UnifiedDeletedRow({
  file,
  row,
  oldSelection,
  beforeCommentButton,
  beforeCommentHighlighted = false,
  beforeCommentRangePosition,
  onBeforeCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'deleted' }>;
  oldSelection?: LineSelectionProps | undefined;
  beforeCommentButton?: ReactNode;
  beforeCommentHighlighted?: boolean;
  beforeCommentRangePosition?: CommentRangePosition | undefined;
  onBeforeCommentLaneEnter?: (() => void) | undefined;
}) {
  const syntaxTokens = getHighlightTokensForLine(row.data.lineNumber, file.syntaxTokens?.oldTokens);

  return (
    <UnifiedLine
      oldLineNumber={row.data.lineNumber}
      newLineNumber={null}
      marker="-"
      className="bg-rose-500/12"
      isChanged
      selection={oldSelection}
      content={renderHighlightedText(row.data.content, [syntaxTokens])}
      commentButton={beforeCommentButton}
      commentHighlighted={beforeCommentHighlighted}
      commentRangePosition={beforeCommentRangePosition}
      onCommentLaneEnter={onBeforeCommentLaneEnter}
    />
  );
}

function UnifiedAddedRow({
  file,
  row,
  newSelection,
  afterCommentButton,
  afterCommentHighlighted = false,
  afterCommentRangePosition,
  onAfterCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'added' }>;
  newSelection?: LineSelectionProps | undefined;
  afterCommentButton?: ReactNode;
  afterCommentHighlighted?: boolean;
  afterCommentRangePosition?: CommentRangePosition | undefined;
  onAfterCommentLaneEnter?: (() => void) | undefined;
}) {
  const syntaxTokens = getHighlightTokensForLine(row.data.lineNumber, file.syntaxTokens?.newTokens);

  return (
    <UnifiedLine
      oldLineNumber={null}
      newLineNumber={row.data.lineNumber}
      marker="+"
      className="bg-emerald-500/12"
      isChanged
      selection={newSelection}
      content={renderHighlightedText(row.data.content, [syntaxTokens])}
      commentButton={afterCommentButton}
      commentHighlighted={afterCommentHighlighted}
      commentRangePosition={afterCommentRangePosition}
      onCommentLaneEnter={onAfterCommentLaneEnter}
    />
  );
}

function UnifiedModifiedRow({
  file,
  row,
  oldSelection,
  newSelection,
  beforeCommentButton,
  afterCommentButton,
  beforeCommentHighlighted = false,
  afterCommentHighlighted = false,
  beforeCommentRangePosition,
  afterCommentRangePosition,
  onBeforeCommentLaneEnter,
  onAfterCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'modified' }>;
  oldSelection?: LineSelectionProps | undefined;
  newSelection?: LineSelectionProps | undefined;
  beforeCommentButton?: ReactNode;
  afterCommentButton?: ReactNode;
  beforeCommentHighlighted?: boolean;
  afterCommentHighlighted?: boolean;
  beforeCommentRangePosition?: CommentRangePosition | undefined;
  afterCommentRangePosition?: CommentRangePosition | undefined;
  onBeforeCommentLaneEnter?: (() => void) | undefined;
  onAfterCommentLaneEnter?: (() => void) | undefined;
}) {
  const beforeSyntaxTokens = getHighlightTokensForLine(row.before.lineNumber, file.syntaxTokens?.oldTokens);
  const afterSyntaxTokens = getHighlightTokensForLine(row.after.lineNumber, file.syntaxTokens?.newTokens);
  const intraLineTokens = row.canIntraLineDiff
    ? getIntraLineDiffTokens(row.before.content, row.after.content)
    : null;

  return (
    <>
      <UnifiedLine
        oldLineNumber={row.before.lineNumber}
        newLineNumber={null}
        marker="-"
        className="bg-rose-500/12"
        isChanged
        selection={oldSelection}
        content={renderHighlightedText(row.before.content, [
          beforeSyntaxTokens,
          intraLineTokens?.before,
        ])}
        commentButton={beforeCommentButton}
        commentHighlighted={beforeCommentHighlighted}
        commentRangePosition={beforeCommentRangePosition}
        onCommentLaneEnter={onBeforeCommentLaneEnter}
      />
      <UnifiedLine
        oldLineNumber={null}
        newLineNumber={row.after.lineNumber}
        marker="+"
        className="bg-emerald-500/12"
        isChanged
        selection={newSelection}
        content={renderHighlightedText(row.after.content, [
          afterSyntaxTokens,
          intraLineTokens?.after,
        ])}
        commentButton={afterCommentButton}
        commentHighlighted={afterCommentHighlighted}
        commentRangePosition={afterCommentRangePosition}
        onCommentLaneEnter={onAfterCommentLaneEnter}
      />
    </>
  );
}

function DiffBodyRow({
  file,
  row,
  oldSelection,
  newSelection,
  onToggleHunkSelection,
  beforeCommentButton,
  afterCommentButton,
  beforeCommentHighlighted = false,
  afterCommentHighlighted = false,
  beforeCommentRangePosition,
  afterCommentRangePosition,
  onBeforeCommentLaneEnter,
  onAfterCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: DiffRenderFile['rows'][number];
  oldSelection?: LineSelectionProps | undefined;
  newSelection?: LineSelectionProps | undefined;
  onToggleHunkSelection?: ((hunkStartLineNumber: number) => void) | undefined;
  beforeCommentButton?: ReactNode;
  afterCommentButton?: ReactNode;
  beforeCommentHighlighted?: boolean;
  afterCommentHighlighted?: boolean;
  beforeCommentRangePosition?: CommentRangePosition | undefined;
  afterCommentRangePosition?: CommentRangePosition | undefined;
  onBeforeCommentLaneEnter?: (() => void) | undefined;
  onAfterCommentLaneEnter?: (() => void) | undefined;
}) {
  switch (row.kind) {
    case 'hunk':
      return (
        <HunkRow
          content={row.content}
          onToggleSelection={
            onToggleHunkSelection
              ? () => onToggleHunkSelection(row.originalStartLineNumber)
              : undefined
          }
          expansionGap={undefined}
          onExpandGap={undefined}
        />
      );
    case 'context':
      return (
        <UnifiedContextRow
          file={file}
          row={row}
          afterCommentButton={afterCommentButton}
          afterCommentHighlighted={afterCommentHighlighted}
          afterCommentRangePosition={afterCommentRangePosition}
          onAfterCommentLaneEnter={onAfterCommentLaneEnter}
        />
      );
    case 'deleted':
      return (
        <UnifiedDeletedRow
          file={file}
          row={row}
          oldSelection={oldSelection}
          beforeCommentButton={beforeCommentButton}
          beforeCommentHighlighted={beforeCommentHighlighted}
          beforeCommentRangePosition={beforeCommentRangePosition}
          onBeforeCommentLaneEnter={onBeforeCommentLaneEnter}
        />
      );
    case 'added':
      return (
        <UnifiedAddedRow
          file={file}
          row={row}
          newSelection={newSelection}
          afterCommentButton={afterCommentButton}
          afterCommentHighlighted={afterCommentHighlighted}
          afterCommentRangePosition={afterCommentRangePosition}
          onAfterCommentLaneEnter={onAfterCommentLaneEnter}
        />
      );
    case 'modified':
      return (
        <UnifiedModifiedRow
          file={file}
          row={row}
          oldSelection={oldSelection}
          newSelection={newSelection}
          beforeCommentButton={beforeCommentButton}
          afterCommentButton={afterCommentButton}
          beforeCommentHighlighted={beforeCommentHighlighted}
          afterCommentHighlighted={afterCommentHighlighted}
          beforeCommentRangePosition={beforeCommentRangePosition}
          afterCommentRangePosition={afterCommentRangePosition}
          onBeforeCommentLaneEnter={onBeforeCommentLaneEnter}
          onAfterCommentLaneEnter={onAfterCommentLaneEnter}
        />
      );
  }
}

export function DiffFileSection({
  file,
  sectionRef,
  getRowSelectionType,
  getHunkSelectionType,
  onToggleRowSelection,
  onToggleHunkSelection,
  onSubmitComment,
  expansionState = {},
  onExpandGap,
  hideHeader = false,
}: {
  file: DiffRenderFile;
  sectionRef: (el: HTMLDivElement | null) => void;
  getRowSelectionType?: ((
    row: DiffRenderFile['rows'][number],
    side?: DiffSelectionSide,
  ) => DiffSelectionType) | undefined;
  getHunkSelectionType?: ((hunkStartLineNumber: number) => DiffSelectionType) | undefined;
  onToggleRowSelection?: ((
    row: DiffRenderFile['rows'][number],
    side?: DiffSelectionSide,
  ) => void) | undefined;
  onToggleHunkSelection?: ((hunkStartLineNumber: number) => void) | undefined;
  onSubmitComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
  expansionState?: DiffFileExpansionState | undefined;
  onExpandGap?: ((gap: DiffExpansionGap, action: DiffExpansionAction) => void) | undefined;
  hideHeader?: boolean | undefined;
}) {
  const config = FILE_STATUS_CONFIG[file.status];
  const [commentDraft, setCommentDraft] = useState<DiffCommentDraft | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selectionDragRef = useRef<{
    active: boolean;
    selectDirection: boolean;
  }>({ active: false, selectDirection: true });

  const handleSelectionDragMouseDown = useCallback(
    (row: DiffRenderFile['rows'][number], side: Exclude<DiffSelectionSide, 'all'>) => {
      if (!getRowSelectionType || !onToggleRowSelection) {
        return;
      }

      const currentState = getRowSelectionType(row, side);
      const direction = currentState === 'none';
      selectionDragRef.current = { active: true, selectDirection: direction };
      onToggleRowSelection(row, side);
    },
    [getRowSelectionType, onToggleRowSelection],
  );

  const handleSelectionToggle = useCallback(
    (row: DiffRenderFile['rows'][number], side: Exclude<DiffSelectionSide, 'all'>) => {
      if (!getRowSelectionType || !onToggleRowSelection) {
        return;
      }

      onToggleRowSelection(row, side);
    },
    [getRowSelectionType, onToggleRowSelection],
  );

  const handleSelectionDragMouseEnter = useCallback(
    (row: DiffRenderFile['rows'][number], side: Exclude<DiffSelectionSide, 'all'>) => {
      if (!selectionDragRef.current.active || !getRowSelectionType || !onToggleRowSelection) {
        return;
      }

      const currentState = getRowSelectionType(row, side);
      const wantSelected = selectionDragRef.current.selectDirection;

      if (wantSelected && currentState === 'none') {
        onToggleRowSelection(row, side);
      } else if (!wantSelected && currentState !== 'none') {
        onToggleRowSelection(row, side);
      }
    },
    [getRowSelectionType, onToggleRowSelection],
  );

  const getLineSelectionProps = useCallback((
    row: DiffRenderFile['rows'][number],
    rowIndex: number,
    side: Exclude<DiffSelectionSide, 'all'>,
  ): LineSelectionProps | undefined => {
    if (!getRowSelectionType || !onToggleRowSelection) {
      return undefined;
    }

    return {
      rowIndex,
      side,
      selectionType: getRowSelectionType(row, side),
      onToggle: () => handleSelectionToggle(row, side),
      onMouseDown: () => handleSelectionDragMouseDown(row, side),
      onMouseEnter: () => handleSelectionDragMouseEnter(row, side),
    };
  }, [
    getRowSelectionType,
    handleSelectionToggle,
    handleSelectionDragMouseDown,
    handleSelectionDragMouseEnter,
    onToggleRowSelection,
  ]);

  useEffect(() => {
    const handleMouseUp = () => {
      selectionDragRef.current.active = false;
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!selectionDragRef.current.active) {
        return;
      }

      const rootElement = rootRef.current;
      if (!rootElement) {
        return;
      }

      const hoveredElement = document.elementFromPoint(event.clientX, event.clientY);
      const selectionTarget = hoveredElement instanceof Element
        ? hoveredElement.closest<HTMLElement>('[data-diff-selection-target="true"]')
        : null;

      if (selectionTarget && rootElement.contains(selectionTarget)) {
        const rowIndexValue = selectionTarget.dataset.diffSelectionRowIndex;
        const sideValue = selectionTarget.dataset.diffSelectionSide;
        const rowIndex = rowIndexValue ? Number.parseInt(rowIndexValue, 10) : Number.NaN;

        if (!Number.isNaN(rowIndex) && (sideValue === 'old' || sideValue === 'new')) {
          const row = file.rows[rowIndex];
          if (row) {
            handleSelectionDragMouseEnter(row, sideValue);
          }
        }
      }

      const scrollContainer = findScrollContainer(rootElement);
      if (!scrollContainer) {
        return;
      }

      const rect = scrollContainer.getBoundingClientRect();
      const edgeThresholdPx = 48;
      const scrollStepPx = ROW_HEIGHT_PX;

      if (event.clientY < rect.top + edgeThresholdPx) {
        scrollContainer.scrollTop -= scrollStepPx;
      } else if (event.clientY > rect.bottom - edgeThresholdPx) {
        scrollContainer.scrollTop += scrollStepPx;
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [file.rows, handleSelectionDragMouseEnter]);

  useEffect(() => {
    if (commentDraft?.isSelecting !== true) {
      return;
    }

    const handleMouseUp = () => {
      setCommentDraft((current) =>
        current === null
          ? null
          : {
              ...current,
              isSelecting: false,
            },
      );
    };

    window.addEventListener('mouseup', handleMouseUp);

    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [commentDraft?.isSelecting]);

  const commentRange = useMemo(() => {
    if (commentDraft === null) {
      return null;
    }

    const from = Math.min(commentDraft.startRowIndex, commentDraft.endRowIndex);
    const to = Math.max(commentDraft.startRowIndex, commentDraft.endRowIndex);

    return { from, to };
  }, [commentDraft]);

  const renderItems = useMemo(
    () => buildDiffRenderExpansionItems(file.diff, file.rows, file.contents, expansionState),
    [expansionState, file.contents, file.diff, file.rows],
  );
  const changeGroupMetadata = useMemo(() => {
    const metadata = new Map<number, { firstRenderIndex: number; renderLineCount: number; selectionType: DiffSelectionType }>();

    renderItems.forEach((item, renderIndex) => {
      if (item.kind !== 'row' || item.rowIndex === null) {
        return;
      }

      const row = item.row;
      if (row.kind !== 'added' && row.kind !== 'deleted' && row.kind !== 'modified') {
        return;
      }

      const renderLineCount = row.kind === 'modified' ? 2 : 1;
      const existing = metadata.get(row.changeGroupStartLineNumber);

      if (existing) {
        existing.renderLineCount += renderLineCount;
        return;
      }

      metadata.set(row.changeGroupStartLineNumber, {
        firstRenderIndex: renderIndex,
        renderLineCount,
        selectionType: getHunkSelectionType?.(row.changeGroupStartLineNumber) ?? 'none',
      });
    });

    return metadata;
  }, [getHunkSelectionType, renderItems]);
  const commentRows = useMemo(
    () =>
      commentRange === null
        ? []
        : renderItems
            .slice(commentRange.from, commentRange.to + 1)
            .flatMap((item) =>
              item.kind === 'row' &&
              commentDraft !== null &&
              getCommentableLineNumber(item.row, commentDraft.side) !== null
                ? [item.row]
                : [],
            ),
    [commentDraft, commentRange, renderItems],
  );

  const commentRangePositions = useMemo(() => {
    if (commentDraft === null || commentRange === null) {
      return new Map<number, CommentRangePosition>();
    }

    const positions = new Map<number, CommentRangePosition>();
    const commentableIndices: number[] = [];

    for (let i = commentRange.from; i <= commentRange.to; i++) {
      const item = renderItems[i];
      if (item?.kind === 'row' && getCommentableLineNumber(item.row, commentDraft.side) !== null) {
        commentableIndices.push(i);
      }
    }

    commentableIndices.forEach((idx, i) => {
      if (commentableIndices.length === 1) {
        positions.set(idx, 'only');
      } else if (i === 0) {
        positions.set(idx, 'first');
      } else if (i === commentableIndices.length - 1) {
        positions.set(idx, 'last');
      } else {
        positions.set(idx, 'middle');
      }
    });

    return positions;
  }, [commentDraft, commentRange, renderItems]);

  const handleStartCommentSelection = (side: DiffCommentSide, rowIndex: number) => {
    setCommentDraft({
      side,
      startRowIndex: rowIndex,
      endRowIndex: rowIndex,
      isSelecting: true,
      body: '',
      error: null,
      isSubmitting: false,
    });
  };

  const handleExtendCommentSelection = (side: DiffCommentSide, rowIndex: number) => {
    setCommentDraft((current) => {
      if (
        current === null ||
        current.isSelecting !== true ||
        current.side !== side
      ) {
        return current;
      }

      return {
        ...current,
        endRowIndex: rowIndex,
      };
    });
  };

  const handleSubmitComment = async () => {
    if (commentDraft === null || onSubmitComment === undefined) {
      return;
    }

    const anchor = buildDiffCommentAnchor(file.diff, commentRows, commentDraft.side);

    if (anchor === null) {
      setCommentDraft(null);
      return;
    }

    setCommentDraft((current) => current === null ? null : { ...current, isSubmitting: true, error: null });

    try {
      await onSubmitComment(anchor, commentDraft.body.trim());
      setCommentDraft(null);
    } catch (error) {
      setCommentDraft((current) => current === null ? null : {
        ...current,
        isSubmitting: false,
        error: error instanceof Error ? error.message : 'Failed to create comment.',
      });
    }
  };

  const getCommentButton = (side: DiffCommentSide, row: DiffRenderFile['rows'][number], rowIndex: number) => {
    if (onSubmitComment === undefined || getCommentableLineNumber(row, side) === null) {
      return undefined;
    }

    const rangePosition = commentDraft?.side === side
      ? commentRangePositions.get(rowIndex)
      : undefined;

    if (rangePosition === 'middle') {
      return undefined;
    }

    return (
      <CommentButton
        onMouseDown={() => handleStartCommentSelection(side, rowIndex)}
        onMouseEnter={() => handleExtendCommentSelection(side, rowIndex)}
      />
    );
  };

  const setSectionElement = useCallback((element: HTMLDivElement | null) => {
    rootRef.current = element;
    sectionRef(element);
  }, [sectionRef]);

  return (
    <div
      ref={setSectionElement}
      data-file-path={file.path}
      className="overflow-hidden border border-border bg-background"
    >
      {!hideHeader ? (
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-muted px-3 py-1.5">
          <FileCodeIcon className="size-3.5 text-muted-foreground" />
          <span className="min-w-0 truncate text-xs font-medium">{file.path}</span>
          <span
            className={cn(
              'inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-current/20 text-[9px] font-bold',
              config.className,
            )}
          >
            {config.letter}
          </span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {file.additions > 0 ? <span className="text-emerald-700">+{file.additions}</span> : null}
            {file.additions > 0 && file.deletions > 0 ? '  ' : null}
            {file.deletions > 0 ? <span className="text-rose-700">-{file.deletions}</span> : null}
          </span>
        </div>
      ) : null}
      <div className="overflow-x-auto overflow-y-hidden">
        <div className="min-w-full w-max">
          {renderItems.map((item, renderIndex) => {
            const hasHunkGutter = getRowSelectionType !== undefined;

            if (item.kind === 'expansion-control') {
              return onExpandGap ? (
                <div key={item.key} className={cn(hasHunkGutter && 'flex')}>
                  {hasHunkGutter ? <EmptyHunkGutter /> : null}
                  <div className={cn(hasHunkGutter && 'min-w-0 flex-1')}>
                    <ExpansionControlRow
                      gap={item.gap}
                      onExpand={(action) => onExpandGap(item.gap, action)}
                    />
                  </div>
                </div>
              ) : null;
            }

            if (item.kind === 'collapsed-hunk') {
              const hunkSelectionType = getHunkSelectionType?.(item.row.originalStartLineNumber);
              return (
                <div key={item.key} className={cn(hasHunkGutter && 'flex')}>
                  {hasHunkGutter ? (
                    hunkSelectionType !== undefined ? (
                      <HunkSelectionGutter
                        selectionType={hunkSelectionType}
                        heightPx={ROW_HEIGHT_PX}
                        onClick={onToggleHunkSelection
                          ? () => onToggleHunkSelection(item.row.originalStartLineNumber)
                          : undefined}
                      />
                    ) : <EmptyHunkGutter />
                  ) : null}
                  <div className={cn(hasHunkGutter && 'min-w-0 flex-1')}>
                    <HunkRow
                      content={item.row.content}
                      onToggleSelection={
                        onToggleHunkSelection
                          ? () => onToggleHunkSelection(item.row.originalStartLineNumber)
                          : undefined
                      }
                      expansionGap={item.gap}
                      onExpandGap={onExpandGap ? (action) => onExpandGap(item.gap, action) : undefined}
                    />
                  </div>
                </div>
              );
            }

            const { row, rowIndex } = item;
            const showComposer =
              commentDraft !== null &&
              commentDraft.isSelecting === false &&
              commentRange !== null &&
              renderIndex === commentRange.to;
            const oldSelection =
              rowIndex !== null && (row.kind === 'deleted' || row.kind === 'modified')
                ? getLineSelectionProps(row, rowIndex, 'old')
                : undefined;
            const newSelection =
              rowIndex !== null && (row.kind === 'added' || row.kind === 'modified')
                ? getLineSelectionProps(row, rowIndex, 'new')
                : undefined;

            const isChangedRow = row.kind === 'added' || row.kind === 'deleted' || row.kind === 'modified';
            const changeGroupMetadataEntry = isChangedRow
              ? changeGroupMetadata.get(row.changeGroupStartLineNumber)
              : undefined;
            const isFirstInGroup = changeGroupMetadataEntry?.firstRenderIndex === renderIndex;

            let hunkGutter: React.ReactNode = null;
            if (hasHunkGutter) {
              if (isChangedRow && isFirstInGroup && changeGroupMetadataEntry) {
                    hunkGutter = (
                      <HunkSelectionGutter
                        selectionType={changeGroupMetadataEntry.selectionType}
                        heightPx={changeGroupMetadataEntry.renderLineCount * ROW_HEIGHT_PX}
                        onClick={onToggleHunkSelection
                          ? () => onToggleHunkSelection(row.changeGroupStartLineNumber)
                          : undefined}
                      />
                    );
                  } else {
                    hunkGutter = <EmptyHunkGutter selectionType={changeGroupMetadataEntry?.selectionType} />;
                  }
                }

            return (
              <div key={item.key} className={cn(hasHunkGutter && 'flex')}>
                {hunkGutter}
                <div className={cn(hasHunkGutter && 'min-w-0 flex-1')}>
                  <DiffBodyRow
                    file={file}
                    row={row}
                    oldSelection={oldSelection}
                    newSelection={newSelection}
                    onToggleHunkSelection={onToggleHunkSelection}
                    beforeCommentButton={getCommentButton('old', row, renderIndex)}
                    afterCommentButton={getCommentButton('new', row, renderIndex)}
                    onBeforeCommentLaneEnter={() => handleExtendCommentSelection('old', renderIndex)}
                    onAfterCommentLaneEnter={() => handleExtendCommentSelection('new', renderIndex)}
                    beforeCommentHighlighted={
                      commentDraft !== null &&
                      commentDraft.side === 'old' &&
                      commentRange !== null &&
                      renderIndex >= commentRange.from &&
                      renderIndex <= commentRange.to &&
                      getCommentableLineNumber(row, 'old') !== null
                    }
                    afterCommentHighlighted={
                      commentDraft !== null &&
                      commentDraft.side === 'new' &&
                      commentRange !== null &&
                      renderIndex >= commentRange.from &&
                      renderIndex <= commentRange.to &&
                      getCommentableLineNumber(row, 'new') !== null
                    }
                    beforeCommentRangePosition={
                      commentDraft?.side === 'old' ? commentRangePositions.get(renderIndex) : undefined
                    }
                    afterCommentRangePosition={
                      commentDraft?.side === 'new' ? commentRangePositions.get(renderIndex) : undefined
                    }
                  />
                  {showComposer && commentDraft ? (() => {
                    const firstRow = commentRows[0];
                    const lastRow = commentRows[commentRows.length - 1];
                    const firstLine = firstRow ? getCommentableLineNumber(firstRow, commentDraft.side) : null;
                    const lastLine = lastRow ? getCommentableLineNumber(lastRow, commentDraft.side) : null;
                    const lineLabel = firstLine !== null && lastLine !== null
                      ? firstLine === lastLine
                        ? `Comment on line ${firstLine}`
                        : `Comment on lines ${firstLine}–${lastLine}`
                      : undefined;

                    return (
                      <InlineCommentComposer
                        lineRangeLabel={lineLabel}
                        body={commentDraft.body}
                        error={commentDraft.error}
                        isSubmitting={commentDraft.isSubmitting}
                        onBodyChange={(body) =>
                          setCommentDraft((current) => current === null ? null : { ...current, body })
                        }
                        onCancel={() => setCommentDraft(null)}
                        onSubmit={() => {
                          void handleSubmitComment();
                        }}
                      />
                    );
                  })() : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
