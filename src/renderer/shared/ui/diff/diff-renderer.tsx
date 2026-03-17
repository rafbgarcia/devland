import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronsUpDownIcon,
  FileCodeIcon,
  PlusIcon,
} from 'lucide-react';

import {
  buildDiffCommentAnchor,
  getCommentableLineNumber,
  type DiffCommentAnchor,
  type DiffDisplayMode,
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

const ROW_BASE_CLASS = 'font-mono text-[13px] leading-[22px]';
const MARKER_CLASS = 'w-5 shrink-0 select-none text-center text-[12px]';
const SELECTION_GUTTER_CLASS =
  'flex w-7 shrink-0 items-center justify-center border-r border-border/30 cursor-pointer select-none';
const LINE_NUMBER_BOX_CLASS =
  'shrink-0 select-none border-r border-border/40 bg-muted/35 text-[12px] text-muted-foreground/75';
const LINE_NUMBER_BOX_WIDTH_CLASS = 'w-[56px]';
const LINE_NUMBER_BOX_DUAL_WIDTH_CLASS = 'w-[112px]';
const LINE_NUMBER_INTERACTIVE_CLASS =
  'group/line-number flex h-full w-full items-stretch text-left';
const LINE_NUMBER_CHECK_CLASS = 'flex w-5 shrink-0 items-center justify-center';
const LINE_NUMBER_VALUE_CLASS = 'flex-1 truncate px-2 text-right';
const LINE_NUMBER_DUAL_VALUE_CLASS = 'flex-1 px-1.5 text-right tabular-nums';
const LINE_NUMBER_CHANGED_HOVER_CLASS = 'hover:bg-primary/10 hover:text-primary/80';

const CHANGE_GROUP_HANDLE_WIDTH_CLASS = 'w-3';

type DiffCommentDraft = {
  side: DiffCommentSide;
  startRowIndex: number;
  endRowIndex: number;
  isSelecting: boolean;
  body: string;
  error: string | null;
  isSubmitting: boolean;
};

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

function DiffColumn({
  lineNumber,
  marker,
  content,
  className,
  isChanged = false,
  selection,
  commentButton,
  commentHighlighted = false,
  onCommentLaneEnter,
}: {
  lineNumber: number | null;
  marker: string;
  content: ReactNode;
  className?: string;
  isChanged?: boolean;
  selection?: LineSelectionProps | undefined;
  commentButton?: ReactNode;
  commentHighlighted?: boolean;
  onCommentLaneEnter?: (() => void) | undefined;
}) {
  return (
    <div
      className={cn(
        'group/column min-w-0 border-r border-border/50 last:border-r-0',
        commentHighlighted && 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/30',
        className,
      )}
      onMouseEnter={onCommentLaneEnter}
    >
      <div className={cn('flex min-w-0', ROW_BASE_CLASS)}>
        <SplitLineNumberBox lineNumber={lineNumber} isChanged={isChanged} selection={selection} />
        <span className={MARKER_CLASS}>{marker}</span>
        <span className="relative min-w-0 flex-1">
          <span className="diff-syntax flex min-w-0 overflow-hidden whitespace-pre px-2 pr-8">
            {content}
          </span>
          {commentButton ? (
            <span className="absolute right-1 top-1/2 -translate-y-1/2">
              {commentButton}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function SplitLineNumberBox({
  lineNumber,
  isChanged = false,
  selection,
}: {
  lineNumber: number | null;
  isChanged?: boolean;
  selection?: LineSelectionProps | undefined;
}) {
  if (selection === undefined) {
    return (
      <span className={cn(LINE_NUMBER_BOX_CLASS, LINE_NUMBER_BOX_WIDTH_CLASS, isChanged && LINE_NUMBER_CHANGED_HOVER_CLASS)}>
        <span className="flex h-full items-stretch">
          <span className={LINE_NUMBER_CHECK_CLASS} />
          <span className={cn(LINE_NUMBER_VALUE_CLASS, 'py-0.5')}>{lineNumber ?? ''}</span>
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
        LINE_NUMBER_BOX_WIDTH_CLASS,
        LINE_NUMBER_INTERACTIVE_CLASS,
        selection.selectionType === 'all' && 'bg-primary/12 text-primary',
        selection.selectionType === 'partial' && 'bg-primary/8 text-primary/70',
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
      <span className={cn(LINE_NUMBER_VALUE_CLASS, 'py-0.5')}>{lineNumber ?? ''}</span>
    </button>
  );
}

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
        selection.selectionType === 'all' && 'bg-primary/12 text-primary',
        selection.selectionType === 'partial' && 'bg-primary/8 text-primary/70',
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
  active,
  onMouseDown,
  onMouseEnter,
}: {
  active: boolean;
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
      className={cn(
        'flex size-6 items-center justify-center rounded-md border border-primary/30 bg-background text-primary opacity-0 shadow-sm group-hover/column:opacity-100',
        active && 'opacity-100',
      )}
      aria-label="Add diff comment"
    >
      <PlusIcon className="size-3.5" />
    </button>
  );
}

function InlineCommentComposer({
  onCancel,
  onSubmit,
  body,
  error,
  isSubmitting,
  onBodyChange,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  body: string;
  error: string | null;
  isSubmitting: boolean;
  onBodyChange: (body: string) => void;
}) {
  return (
    <div className="border-t border-border/50 bg-amber-500/5 p-3">
      {error ? (
        <Alert className="mb-3">
          <AlertTitle>Comment failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <Textarea
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
          placeholder="Leave a comment"
          rows={4}
          disabled={isSubmitting}
        />
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting || body.trim().length === 0}
          >
            {isSubmitting ? 'Sending…' : 'Add comment'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SelectionGutterCell({
  selectionType,
  onMouseDown,
  onMouseEnter,
  className,
}: {
  selectionType: DiffSelectionType;
  onMouseDown?: (() => void) | undefined;
  onMouseEnter?: (() => void) | undefined;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        SELECTION_GUTTER_CLASS,
        selectionType === 'all' && 'bg-primary/12 text-primary',
        selectionType === 'partial' && 'bg-primary/8 text-primary/60',
        selectionType === 'none' && 'text-transparent hover:bg-muted/50 hover:text-muted-foreground/30',
        className,
      )}
      onMouseDown={onMouseDown ? (e) => { e.preventDefault(); onMouseDown(); } : undefined}
      onMouseEnter={onMouseEnter}
    >
      {selectionType !== 'none' ? (
        <CheckIcon className="size-3" />
      ) : null}
    </div>
  );
}

function HunkRow({
  content,
  selectionType,
  onToggleSelection,
}: {
  content: string;
  selectionType?: DiffSelectionType | undefined;
  onToggleSelection?: (() => void) | undefined;
}) {
  return (
    <div
      className={cn(
        'flex border-y border-border/50 bg-muted/70',
        onToggleSelection && 'cursor-pointer hover:bg-muted',
      )}
      onClick={onToggleSelection}
    >
      {selectionType !== undefined ? (
        <SelectionGutterCell selectionType={selectionType} />
      ) : null}
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
  onCommentLaneEnter?: (() => void) | undefined;
}) {
  return (
    <div className="flex">
      <div
        className={cn(
          'group/column min-w-0 flex-1',
          commentHighlighted && 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/30',
          className,
        )}
        onMouseEnter={onCommentLaneEnter}
      >
        <div className={cn('flex min-w-0', ROW_BASE_CLASS)}>
          <UnifiedLineNumberBox
            oldLineNumber={oldLineNumber}
            newLineNumber={newLineNumber}
            isChanged={isChanged}
            selection={selection}
          />
          <span className={MARKER_CLASS}>{marker}</span>
          <span className="relative min-w-0 flex-1">
            <span className="diff-syntax flex min-w-0 overflow-hidden whitespace-pre px-2 pr-8">
              {content}
            </span>
            {commentButton ? (
              <span className="absolute right-1 top-1/2 -translate-y-1/2">
                {commentButton}
              </span>
            ) : null}
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
              LINE_NUMBER_BOX_WIDTH_CLASS,
              'flex h-[22px] items-center justify-center hover:bg-muted/80 hover:text-foreground',
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
                  LINE_NUMBER_BOX_WIDTH_CLASS,
                  'flex h-[22px] items-center justify-center hover:bg-muted/80 hover:text-foreground',
                )}
                onClick={() => onExpand('down')}
                aria-label="Expand down"
              >
                <ChevronDownIcon className="size-3" />
              </button>
            ) : null}
            {gap.canExpandUp ? (
              <button
                type="button"
                className={cn(
                  LINE_NUMBER_BOX_CLASS,
                  LINE_NUMBER_BOX_WIDTH_CLASS,
                  'flex h-[22px] items-center justify-center hover:bg-muted/80 hover:text-foreground',
                )}
                onClick={() => onExpand('up')}
                aria-label="Expand up"
              >
                <ChevronUpIcon className="size-3" />
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

function ChangeGroupHandle({
  selectionType,
  handleHeightPx,
  showHandle,
  onClick,
}: {
  selectionType: DiffSelectionType;
  handleHeightPx: number;
  showHandle: boolean;
  onClick?: (() => void) | undefined;
}) {
  return (
    <div className={cn('relative shrink-0', CHANGE_GROUP_HANDLE_WIDTH_CLASS)}>
      {showHandle ? (
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'absolute left-1 top-0 z-10 w-1.5 rounded-full',
            selectionType === 'none' && 'bg-muted-foreground/25 hover:bg-muted-foreground/50',
            selectionType === 'partial' && 'bg-primary/50 hover:bg-primary/70',
            selectionType === 'all' && 'bg-primary hover:bg-primary/80',
          )}
          style={{ height: handleHeightPx }}
          aria-label="Toggle change group selection"
        />
      ) : (
        <span className="block h-full bg-transparent" />
      )}
    </div>
  );
}

function ChangedRowFrame({
  children,
  selectionType,
  handleHeightPx,
  showHandle,
  onToggleSelection,
}: {
  children: ReactNode;
  selectionType?: DiffSelectionType | undefined;
  handleHeightPx?: number | undefined;
  showHandle?: boolean | undefined;
  onToggleSelection?: (() => void) | undefined;
}) {
  if (selectionType === undefined || handleHeightPx === undefined || showHandle === undefined) {
    return <>{children}</>;
  }

  return (
    <div className="relative flex overflow-visible">
      <ChangeGroupHandle
        selectionType={selectionType}
        handleHeightPx={handleHeightPx}
        showHandle={showHandle}
        onClick={onToggleSelection}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ContextRow({
  file,
  row,
  beforeCommentButton,
  afterCommentButton,
  beforeCommentHighlighted = false,
  afterCommentHighlighted = false,
  onBeforeCommentLaneEnter,
  onAfterCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'context' }>;
  beforeCommentButton?: ReactNode;
  afterCommentButton?: ReactNode;
  beforeCommentHighlighted?: boolean;
  afterCommentHighlighted?: boolean;
  onBeforeCommentLaneEnter?: (() => void) | undefined;
  onAfterCommentLaneEnter?: (() => void) | undefined;
}) {
  const oldTokens = getHighlightTokensForLine(row.beforeLineNumber, file.syntaxTokens?.oldTokens);
  const newTokens = getHighlightTokensForLine(row.afterLineNumber, file.syntaxTokens?.newTokens);
  const fallbackTokens = oldTokens ?? newTokens;

  return (
    <div className="grid min-w-0 flex-1 grid-cols-2">
      <DiffColumn
        lineNumber={row.beforeLineNumber}
        marker=""
        content={renderHighlightedText(row.content, [fallbackTokens])}
        commentButton={beforeCommentButton}
        commentHighlighted={beforeCommentHighlighted}
        onCommentLaneEnter={onBeforeCommentLaneEnter}
      />
      <DiffColumn
        lineNumber={row.afterLineNumber}
        marker=""
        content={renderHighlightedText(row.content, [newTokens ?? oldTokens])}
        commentButton={afterCommentButton}
        commentHighlighted={afterCommentHighlighted}
        onCommentLaneEnter={onAfterCommentLaneEnter}
      />
    </div>
  );
}

function DeletedRow({
  file,
  row,
  oldSelection,
  changeGroupSelectionType,
  showChangeGroupHandle,
  changeGroupHandleHeightPx,
  onToggleChangeGroupSelection,
  beforeCommentButton,
  beforeCommentHighlighted = false,
  onBeforeCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'deleted' }>;
  oldSelection?: LineSelectionProps | undefined;
  changeGroupSelectionType?: DiffSelectionType | undefined;
  showChangeGroupHandle?: boolean | undefined;
  changeGroupHandleHeightPx?: number | undefined;
  onToggleChangeGroupSelection?: (() => void) | undefined;
  beforeCommentButton?: ReactNode;
  beforeCommentHighlighted?: boolean;
  onBeforeCommentLaneEnter?: (() => void) | undefined;
}) {
  const syntaxTokens = getHighlightTokensForLine(row.data.lineNumber, file.syntaxTokens?.oldTokens);

  return (
    <ChangedRowFrame
      selectionType={changeGroupSelectionType}
      showHandle={showChangeGroupHandle}
      handleHeightPx={changeGroupHandleHeightPx}
      onToggleSelection={onToggleChangeGroupSelection}
    >
      <div className="grid min-w-0 flex-1 grid-cols-2">
        <DiffColumn
          lineNumber={row.data.lineNumber}
          marker="-"
          className="bg-rose-500/12"
          isChanged
          selection={oldSelection}
          content={renderHighlightedText(row.data.content, [syntaxTokens])}
          commentButton={beforeCommentButton}
          commentHighlighted={beforeCommentHighlighted}
          onCommentLaneEnter={onBeforeCommentLaneEnter}
        />
        <DiffColumn
          lineNumber={null}
          marker=""
          className="bg-background"
          content=""
        />
      </div>
    </ChangedRowFrame>
  );
}

function AddedRow({
  file,
  row,
  newSelection,
  changeGroupSelectionType,
  showChangeGroupHandle,
  changeGroupHandleHeightPx,
  onToggleChangeGroupSelection,
  afterCommentButton,
  afterCommentHighlighted = false,
  onAfterCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'added' }>;
  newSelection?: LineSelectionProps | undefined;
  changeGroupSelectionType?: DiffSelectionType | undefined;
  showChangeGroupHandle?: boolean | undefined;
  changeGroupHandleHeightPx?: number | undefined;
  onToggleChangeGroupSelection?: (() => void) | undefined;
  afterCommentButton?: ReactNode;
  afterCommentHighlighted?: boolean;
  onAfterCommentLaneEnter?: (() => void) | undefined;
}) {
  const syntaxTokens = getHighlightTokensForLine(row.data.lineNumber, file.syntaxTokens?.newTokens);

  return (
    <ChangedRowFrame
      selectionType={changeGroupSelectionType}
      showHandle={showChangeGroupHandle}
      handleHeightPx={changeGroupHandleHeightPx}
      onToggleSelection={onToggleChangeGroupSelection}
    >
      <div className="grid min-w-0 flex-1 grid-cols-2">
        <DiffColumn
          lineNumber={null}
          marker=""
          className="bg-background"
          content=""
        />
        <DiffColumn
          lineNumber={row.data.lineNumber}
          marker="+"
          className="bg-emerald-500/12"
          isChanged
          selection={newSelection}
          content={renderHighlightedText(row.data.content, [syntaxTokens])}
          commentButton={afterCommentButton}
          commentHighlighted={afterCommentHighlighted}
          onCommentLaneEnter={onAfterCommentLaneEnter}
        />
      </div>
    </ChangedRowFrame>
  );
}

function ModifiedRow({
  file,
  row,
  oldSelection,
  newSelection,
  changeGroupSelectionType,
  showChangeGroupHandle,
  changeGroupHandleHeightPx,
  onToggleChangeGroupSelection,
  beforeCommentButton,
  afterCommentButton,
  beforeCommentHighlighted = false,
  afterCommentHighlighted = false,
  onBeforeCommentLaneEnter,
  onAfterCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'modified' }>;
  oldSelection?: LineSelectionProps | undefined;
  newSelection?: LineSelectionProps | undefined;
  changeGroupSelectionType?: DiffSelectionType | undefined;
  showChangeGroupHandle?: boolean | undefined;
  changeGroupHandleHeightPx?: number | undefined;
  onToggleChangeGroupSelection?: (() => void) | undefined;
  beforeCommentButton?: ReactNode;
  afterCommentButton?: ReactNode;
  beforeCommentHighlighted?: boolean;
  afterCommentHighlighted?: boolean;
  onBeforeCommentLaneEnter?: (() => void) | undefined;
  onAfterCommentLaneEnter?: (() => void) | undefined;
}) {
  const beforeSyntaxTokens = getHighlightTokensForLine(row.before.lineNumber, file.syntaxTokens?.oldTokens);
  const afterSyntaxTokens = getHighlightTokensForLine(row.after.lineNumber, file.syntaxTokens?.newTokens);
  const intraLineTokens = row.canIntraLineDiff
    ? getIntraLineDiffTokens(row.before.content, row.after.content)
    : null;

  return (
    <ChangedRowFrame
      selectionType={changeGroupSelectionType}
      showHandle={showChangeGroupHandle}
      handleHeightPx={changeGroupHandleHeightPx}
      onToggleSelection={onToggleChangeGroupSelection}
    >
      <div className="grid min-w-0 flex-1 grid-cols-2">
        <DiffColumn
          lineNumber={row.before.lineNumber}
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
          onCommentLaneEnter={onBeforeCommentLaneEnter}
        />
        <DiffColumn
          lineNumber={row.after.lineNumber}
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
          onCommentLaneEnter={onAfterCommentLaneEnter}
        />
      </div>
    </ChangedRowFrame>
  );
}

function UnifiedContextRow({
  file,
  row,
  afterCommentButton,
  afterCommentHighlighted = false,
  onAfterCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'context' }>;
  afterCommentButton?: ReactNode;
  afterCommentHighlighted?: boolean;
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
      onCommentLaneEnter={onAfterCommentLaneEnter}
    />
  );
}

function UnifiedDeletedRow({
  file,
  row,
  oldSelection,
  changeGroupSelectionType,
  showChangeGroupHandle,
  changeGroupHandleHeightPx,
  onToggleChangeGroupSelection,
  beforeCommentButton,
  beforeCommentHighlighted = false,
  onBeforeCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'deleted' }>;
  oldSelection?: LineSelectionProps | undefined;
  changeGroupSelectionType?: DiffSelectionType | undefined;
  showChangeGroupHandle?: boolean | undefined;
  changeGroupHandleHeightPx?: number | undefined;
  onToggleChangeGroupSelection?: (() => void) | undefined;
  beforeCommentButton?: ReactNode;
  beforeCommentHighlighted?: boolean;
  onBeforeCommentLaneEnter?: (() => void) | undefined;
}) {
  const syntaxTokens = getHighlightTokensForLine(row.data.lineNumber, file.syntaxTokens?.oldTokens);

  return (
    <ChangedRowFrame
      selectionType={changeGroupSelectionType}
      showHandle={showChangeGroupHandle}
      handleHeightPx={changeGroupHandleHeightPx}
      onToggleSelection={onToggleChangeGroupSelection}
    >
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
        onCommentLaneEnter={onBeforeCommentLaneEnter}
      />
    </ChangedRowFrame>
  );
}

function UnifiedAddedRow({
  file,
  row,
  newSelection,
  changeGroupSelectionType,
  showChangeGroupHandle,
  changeGroupHandleHeightPx,
  onToggleChangeGroupSelection,
  afterCommentButton,
  afterCommentHighlighted = false,
  onAfterCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'added' }>;
  newSelection?: LineSelectionProps | undefined;
  changeGroupSelectionType?: DiffSelectionType | undefined;
  showChangeGroupHandle?: boolean | undefined;
  changeGroupHandleHeightPx?: number | undefined;
  onToggleChangeGroupSelection?: (() => void) | undefined;
  afterCommentButton?: ReactNode;
  afterCommentHighlighted?: boolean;
  onAfterCommentLaneEnter?: (() => void) | undefined;
}) {
  const syntaxTokens = getHighlightTokensForLine(row.data.lineNumber, file.syntaxTokens?.newTokens);

  return (
    <ChangedRowFrame
      selectionType={changeGroupSelectionType}
      showHandle={showChangeGroupHandle}
      handleHeightPx={changeGroupHandleHeightPx}
      onToggleSelection={onToggleChangeGroupSelection}
    >
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
        onCommentLaneEnter={onAfterCommentLaneEnter}
      />
    </ChangedRowFrame>
  );
}

function UnifiedModifiedRow({
  file,
  row,
  oldSelection,
  newSelection,
  changeGroupSelectionType,
  showChangeGroupHandle,
  changeGroupHandleHeightPx,
  onToggleChangeGroupSelection,
  beforeCommentButton,
  afterCommentButton,
  beforeCommentHighlighted = false,
  afterCommentHighlighted = false,
  onBeforeCommentLaneEnter,
  onAfterCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'modified' }>;
  oldSelection?: LineSelectionProps | undefined;
  newSelection?: LineSelectionProps | undefined;
  changeGroupSelectionType?: DiffSelectionType | undefined;
  showChangeGroupHandle?: boolean | undefined;
  changeGroupHandleHeightPx?: number | undefined;
  onToggleChangeGroupSelection?: (() => void) | undefined;
  beforeCommentButton?: ReactNode;
  afterCommentButton?: ReactNode;
  beforeCommentHighlighted?: boolean;
  afterCommentHighlighted?: boolean;
  onBeforeCommentLaneEnter?: (() => void) | undefined;
  onAfterCommentLaneEnter?: (() => void) | undefined;
}) {
  const beforeSyntaxTokens = getHighlightTokensForLine(row.before.lineNumber, file.syntaxTokens?.oldTokens);
  const afterSyntaxTokens = getHighlightTokensForLine(row.after.lineNumber, file.syntaxTokens?.newTokens);
  const intraLineTokens = row.canIntraLineDiff
    ? getIntraLineDiffTokens(row.before.content, row.after.content)
    : null;

  return (
    <ChangedRowFrame
      selectionType={changeGroupSelectionType}
      showHandle={showChangeGroupHandle}
      handleHeightPx={changeGroupHandleHeightPx}
      onToggleSelection={onToggleChangeGroupSelection}
    >
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
          onCommentLaneEnter={onAfterCommentLaneEnter}
        />
      </>
    </ChangedRowFrame>
  );
}

function DiffBodyRow({
  displayMode,
  file,
  row,
  selectionType,
  changeGroupSelectionType,
  showChangeGroupHandle,
  changeGroupHandleHeightPx,
  oldSelection,
  newSelection,
  onToggleHunkSelection,
  onToggleChangeGroupSelection,
  beforeCommentButton,
  afterCommentButton,
  beforeCommentHighlighted = false,
  afterCommentHighlighted = false,
  onBeforeCommentLaneEnter,
  onAfterCommentLaneEnter,
}: {
  displayMode: DiffDisplayMode;
  file: DiffRenderFile;
  row: DiffRenderFile['rows'][number];
  selectionType?: DiffSelectionType | undefined;
  changeGroupSelectionType?: DiffSelectionType | undefined;
  showChangeGroupHandle?: boolean | undefined;
  changeGroupHandleHeightPx?: number | undefined;
  oldSelection?: LineSelectionProps | undefined;
  newSelection?: LineSelectionProps | undefined;
  onToggleHunkSelection?: ((hunkStartLineNumber: number) => void) | undefined;
  onToggleChangeGroupSelection?: (() => void) | undefined;
  beforeCommentButton?: ReactNode;
  afterCommentButton?: ReactNode;
  beforeCommentHighlighted?: boolean;
  afterCommentHighlighted?: boolean;
  onBeforeCommentLaneEnter?: (() => void) | undefined;
  onAfterCommentLaneEnter?: (() => void) | undefined;
}) {
  switch (row.kind) {
    case 'hunk':
      return (
        <HunkRow
          content={row.content}
          selectionType={selectionType}
          onToggleSelection={
            selectionType !== undefined && onToggleHunkSelection
              ? () => onToggleHunkSelection(row.originalStartLineNumber)
              : undefined
          }
        />
      );
    case 'context':
      return displayMode === 'unified'
        ? (
            <UnifiedContextRow
              file={file}
              row={row}
              afterCommentButton={afterCommentButton}
              afterCommentHighlighted={afterCommentHighlighted}
              onAfterCommentLaneEnter={onAfterCommentLaneEnter}
            />
          )
        : (
            <ContextRow
              file={file}
              row={row}
              beforeCommentButton={beforeCommentButton}
              afterCommentButton={afterCommentButton}
              beforeCommentHighlighted={beforeCommentHighlighted}
              afterCommentHighlighted={afterCommentHighlighted}
              onBeforeCommentLaneEnter={onBeforeCommentLaneEnter}
              onAfterCommentLaneEnter={onAfterCommentLaneEnter}
            />
          );
    case 'deleted':
      return displayMode === 'unified'
        ? (
            <UnifiedDeletedRow
              file={file}
              row={row}
              oldSelection={oldSelection}
              changeGroupSelectionType={changeGroupSelectionType}
              showChangeGroupHandle={showChangeGroupHandle}
              changeGroupHandleHeightPx={changeGroupHandleHeightPx}
              onToggleChangeGroupSelection={onToggleChangeGroupSelection}
              beforeCommentButton={beforeCommentButton}
              beforeCommentHighlighted={beforeCommentHighlighted}
              onBeforeCommentLaneEnter={onBeforeCommentLaneEnter}
            />
          )
        : (
            <DeletedRow
              file={file}
              row={row}
              oldSelection={oldSelection}
              changeGroupSelectionType={changeGroupSelectionType}
              showChangeGroupHandle={showChangeGroupHandle}
              changeGroupHandleHeightPx={changeGroupHandleHeightPx}
              onToggleChangeGroupSelection={onToggleChangeGroupSelection}
              beforeCommentButton={beforeCommentButton}
              beforeCommentHighlighted={beforeCommentHighlighted}
              onBeforeCommentLaneEnter={onBeforeCommentLaneEnter}
            />
          );
    case 'added':
      return displayMode === 'unified'
        ? (
            <UnifiedAddedRow
              file={file}
              row={row}
              newSelection={newSelection}
              changeGroupSelectionType={changeGroupSelectionType}
              showChangeGroupHandle={showChangeGroupHandle}
              changeGroupHandleHeightPx={changeGroupHandleHeightPx}
              onToggleChangeGroupSelection={onToggleChangeGroupSelection}
              afterCommentButton={afterCommentButton}
              afterCommentHighlighted={afterCommentHighlighted}
              onAfterCommentLaneEnter={onAfterCommentLaneEnter}
            />
          )
        : (
            <AddedRow
              file={file}
              row={row}
              newSelection={newSelection}
              changeGroupSelectionType={changeGroupSelectionType}
              showChangeGroupHandle={showChangeGroupHandle}
              changeGroupHandleHeightPx={changeGroupHandleHeightPx}
              onToggleChangeGroupSelection={onToggleChangeGroupSelection}
              afterCommentButton={afterCommentButton}
              afterCommentHighlighted={afterCommentHighlighted}
              onAfterCommentLaneEnter={onAfterCommentLaneEnter}
            />
          );
    case 'modified':
      return displayMode === 'unified'
        ? (
            <UnifiedModifiedRow
              file={file}
              row={row}
              oldSelection={oldSelection}
              newSelection={newSelection}
              changeGroupSelectionType={changeGroupSelectionType}
              showChangeGroupHandle={showChangeGroupHandle}
              changeGroupHandleHeightPx={changeGroupHandleHeightPx}
              onToggleChangeGroupSelection={onToggleChangeGroupSelection}
              beforeCommentButton={beforeCommentButton}
              afterCommentButton={afterCommentButton}
              beforeCommentHighlighted={beforeCommentHighlighted}
              afterCommentHighlighted={afterCommentHighlighted}
              onBeforeCommentLaneEnter={onBeforeCommentLaneEnter}
              onAfterCommentLaneEnter={onAfterCommentLaneEnter}
            />
          )
        : (
            <ModifiedRow
              file={file}
              row={row}
              oldSelection={oldSelection}
              newSelection={newSelection}
              changeGroupSelectionType={changeGroupSelectionType}
              showChangeGroupHandle={showChangeGroupHandle}
              changeGroupHandleHeightPx={changeGroupHandleHeightPx}
              onToggleChangeGroupSelection={onToggleChangeGroupSelection}
              beforeCommentButton={beforeCommentButton}
              afterCommentButton={afterCommentButton}
              beforeCommentHighlighted={beforeCommentHighlighted}
              afterCommentHighlighted={afterCommentHighlighted}
              onBeforeCommentLaneEnter={onBeforeCommentLaneEnter}
              onAfterCommentLaneEnter={onAfterCommentLaneEnter}
            />
          );
  }
}

export function DiffFileSection({
  file,
  displayMode,
  sectionRef,
  selectionType,
  getRowSelectionType,
  getHunkSelectionType,
  onToggleFileSelection,
  onToggleRowSelection,
  onToggleHunkSelection,
  onSubmitComment,
  expansionState = {},
  onExpandGap,
  hideHeader = false,
}: {
  file: DiffRenderFile;
  displayMode: DiffDisplayMode;
  sectionRef: (el: HTMLDivElement | null) => void;
  selectionType?: DiffSelectionType | undefined;
  getRowSelectionType?: ((
    row: DiffRenderFile['rows'][number],
    side?: DiffSelectionSide,
  ) => DiffSelectionType) | undefined;
  getHunkSelectionType?: ((hunkStartLineNumber: number) => DiffSelectionType) | undefined;
  onToggleFileSelection?: (() => void) | undefined;
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
      const scrollStepPx = 22;

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

      const renderLineCount = displayMode === 'unified' && row.kind === 'modified' ? 2 : 1;
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
  }, [displayMode, getHunkSelectionType, renderItems]);
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

    const isActive =
      commentDraft !== null &&
      commentDraft.side === side &&
      commentRange !== null &&
      rowIndex >= commentRange.from &&
      rowIndex <= commentRange.to;

    return (
      <CommentButton
        active={isActive}
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
          {selectionType !== undefined ? (
            <input
              type="checkbox"
              checked={selectionType === 'all'}
              ref={(el) => {
                if (el) {
                  el.indeterminate = selectionType === 'partial';
                }
              }}
              onChange={onToggleFileSelection}
              className="shrink-0"
            />
          ) : null}
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
      <div className="overflow-x-auto">
        <div className={cn(displayMode === 'split' ? 'min-w-[960px]' : 'min-w-[720px]')}>
          {renderItems.map((item, renderIndex) => {
            const hasSelectionGutter = getRowSelectionType !== undefined;

            if (item.kind === 'expansion-control') {
              return onExpandGap ? (
                <div key={item.key} className={hasSelectionGutter ? 'pl-3' : undefined}>
                  <ExpansionControlRow
                    gap={item.gap}
                    onExpand={(action) => onExpandGap(item.gap, action)}
                  />
                </div>
              ) : null;
            }

            const { row, rowIndex } = item;
            const isChangedRow = row.kind === 'added' || row.kind === 'deleted' || row.kind === 'modified';
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
            const changeGroupMetadataEntry =
              row.kind === 'added' || row.kind === 'deleted' || row.kind === 'modified'
                ? changeGroupMetadata.get(row.changeGroupStartLineNumber)
                : undefined;

            return (
              <div key={item.key} className={hasSelectionGutter && !isChangedRow ? 'pl-3' : undefined}>
                <DiffBodyRow
                  displayMode={displayMode}
                  file={file}
                  row={row}
                  selectionType={undefined}
                  changeGroupSelectionType={changeGroupMetadataEntry?.selectionType}
                  showChangeGroupHandle={changeGroupMetadataEntry?.firstRenderIndex === renderIndex}
                  changeGroupHandleHeightPx={changeGroupMetadataEntry
                    ? changeGroupMetadataEntry.renderLineCount * 22
                    : undefined}
                  oldSelection={oldSelection}
                  newSelection={newSelection}
                  onToggleHunkSelection={onToggleHunkSelection}
                  onToggleChangeGroupSelection={
                    row.kind === 'added' || row.kind === 'deleted' || row.kind === 'modified'
                      ? onToggleHunkSelection
                        ? () => onToggleHunkSelection(row.changeGroupStartLineNumber)
                        : undefined
                      : undefined
                  }
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
                />
                {showComposer && commentDraft ? (
                  <InlineCommentComposer
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
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
