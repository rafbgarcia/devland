import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { CheckIcon, FileCodeIcon, MinusIcon, PlusIcon } from 'lucide-react';

import {
  buildDiffCommentAnchor,
  getCommentableLineNumber,
  type DiffCommentAnchor,
  type DiffDisplayMode,
  type DiffCommentSide,
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

import type { DiffRenderFile } from './use-diff-render-files';

const ROW_BASE_CLASS = 'font-mono text-[13px] leading-[22px]';
const GUTTER_CLASS =
  'w-[52px] shrink-0 select-none border-r border-border/40 px-2 text-right text-[12px] text-muted-foreground/75';
const MARKER_CLASS = 'w-5 shrink-0 select-none text-center text-[12px]';
const SELECTION_GUTTER_CLASS =
  'flex w-10 shrink-0 items-stretch justify-center border-r border-border/50 bg-muted/30';

type DiffCommentDraft = {
  side: DiffCommentSide;
  startRowIndex: number;
  endRowIndex: number;
  isSelecting: boolean;
  body: string;
  error: string | null;
  isSubmitting: boolean;
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
  oldLineNumber,
  newLineNumber,
  marker,
  content,
  className,
  commentButton,
  commentHighlighted = false,
  onCommentLaneEnter,
}: {
  oldLineNumber: number | null;
  newLineNumber: number | null;
  marker: string;
  content: ReactNode;
  className?: string;
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
        <span className={GUTTER_CLASS}>{oldLineNumber ?? ''}</span>
        <span className="relative w-[52px] shrink-0 select-none border-r border-border/40 px-2 text-right text-[12px] text-muted-foreground/75">
          {newLineNumber ?? ''}
          {commentButton}
        </span>
        <span className={MARKER_CLASS}>{marker}</span>
        <span className="diff-syntax min-w-0 flex-1 overflow-hidden whitespace-pre px-2">
          {content}
        </span>
      </div>
    </div>
  );
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
        'absolute left-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md border border-primary/30 bg-background text-primary opacity-0 shadow-sm transition-opacity group-hover/column:opacity-100',
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

function SelectionToggle({
  selectionType,
  onClick,
  disabled = false,
  className,
}: {
  selectionType: DiffSelectionType;
  onClick?: (() => void) | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}) {
  const icon =
    selectionType === 'all' ? <CheckIcon className="size-3.5" /> : selectionType === 'partial'
      ? <MinusIcon className="size-3.5" />
      : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={cn(
        'my-0.5 flex size-6 items-center justify-center rounded-md border text-muted-foreground transition-colors',
        selectionType === 'all' && 'border-primary bg-primary text-primary-foreground',
        selectionType === 'partial' && 'border-primary/70 bg-primary/15 text-primary',
        selectionType === 'none' && 'border-border/70 bg-background hover:border-primary/40 hover:text-foreground',
        (disabled || !onClick) && 'cursor-default opacity-60 hover:border-border/70 hover:text-muted-foreground',
        className,
      )}
      aria-pressed={selectionType !== 'none'}
    >
      {icon}
    </button>
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
    <div className="flex border-y border-border/50 bg-muted/70">
      {selectionType ? (
        <div className={SELECTION_GUTTER_CLASS}>
          <SelectionToggle
            selectionType={selectionType}
            onClick={onToggleSelection}
            className="mt-1"
          />
        </div>
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
  selectionType,
  onToggleSelection,
  commentButton,
  commentHighlighted = false,
  onCommentLaneEnter,
}: {
  oldLineNumber: number | null;
  newLineNumber: number | null;
  marker: string;
  content: ReactNode;
  className?: string;
  selectionType?: DiffSelectionType | undefined;
  onToggleSelection?: (() => void) | undefined;
  commentButton?: ReactNode;
  commentHighlighted?: boolean;
  onCommentLaneEnter?: (() => void) | undefined;
}) {
  return (
    <div className="flex">
      {selectionType ? (
        <div className={SELECTION_GUTTER_CLASS}>
          {onToggleSelection ? (
            <SelectionToggle selectionType={selectionType} onClick={onToggleSelection} />
          ) : null}
        </div>
      ) : null}
      <div
        className={cn(
          'group/column min-w-0 flex-1',
          commentHighlighted && 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/30',
          className,
        )}
        onMouseEnter={onCommentLaneEnter}
      >
        <div className={cn('flex min-w-0', ROW_BASE_CLASS)}>
          <span className={GUTTER_CLASS}>{oldLineNumber ?? ''}</span>
          <span className="relative w-[52px] shrink-0 select-none border-r border-border/40 px-2 text-right text-[12px] text-muted-foreground/75">
            {newLineNumber ?? ''}
            {commentButton}
          </span>
          <span className={MARKER_CLASS}>{marker}</span>
          <span className="diff-syntax min-w-0 flex-1 overflow-hidden whitespace-pre px-2">
            {content}
          </span>
        </div>
      </div>
    </div>
  );
}

function ContextRow({
  file,
  row,
  selectionType,
  beforeCommentButton,
  afterCommentButton,
  beforeCommentHighlighted = false,
  afterCommentHighlighted = false,
  onBeforeCommentLaneEnter,
  onAfterCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'context' }>;
  selectionType?: DiffSelectionType | undefined;
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
    <div className="flex">
      {selectionType ? <div className={SELECTION_GUTTER_CLASS} /> : null}
      <div className="grid min-w-0 flex-1 grid-cols-2">
        <DiffColumn
          oldLineNumber={row.beforeLineNumber}
          newLineNumber={row.afterLineNumber}
          marker=""
          content={renderHighlightedText(row.content, [fallbackTokens])}
          commentButton={beforeCommentButton}
          commentHighlighted={beforeCommentHighlighted}
          onCommentLaneEnter={onBeforeCommentLaneEnter}
        />
        <DiffColumn
          oldLineNumber={row.beforeLineNumber}
          newLineNumber={row.afterLineNumber}
          marker=""
          content={renderHighlightedText(row.content, [newTokens ?? oldTokens])}
          commentButton={afterCommentButton}
          commentHighlighted={afterCommentHighlighted}
          onCommentLaneEnter={onAfterCommentLaneEnter}
        />
      </div>
    </div>
  );
}

function DeletedRow({
  file,
  row,
  selectionType,
  onToggleSelection,
  beforeCommentButton,
  beforeCommentHighlighted = false,
  onBeforeCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'deleted' }>;
  selectionType?: DiffSelectionType | undefined;
  onToggleSelection?: (() => void) | undefined;
  beforeCommentButton?: ReactNode;
  beforeCommentHighlighted?: boolean;
  onBeforeCommentLaneEnter?: (() => void) | undefined;
}) {
  const syntaxTokens = getHighlightTokensForLine(row.data.lineNumber, file.syntaxTokens?.oldTokens);

  return (
    <div className="flex">
      {selectionType ? (
        <div className={SELECTION_GUTTER_CLASS}>
          <SelectionToggle selectionType={selectionType} onClick={onToggleSelection} />
        </div>
      ) : null}
      <div className="grid min-w-0 flex-1 grid-cols-2">
        <DiffColumn
          oldLineNumber={row.data.lineNumber}
          newLineNumber={null}
          marker="-"
          className="bg-rose-500/12"
          content={renderHighlightedText(row.data.content, [syntaxTokens])}
          commentButton={beforeCommentButton}
          commentHighlighted={beforeCommentHighlighted}
          onCommentLaneEnter={onBeforeCommentLaneEnter}
        />
        <DiffColumn
          oldLineNumber={null}
          newLineNumber={null}
          marker=""
          className="bg-background"
          content=""
        />
      </div>
    </div>
  );
}

function AddedRow({
  file,
  row,
  selectionType,
  onToggleSelection,
  afterCommentButton,
  afterCommentHighlighted = false,
  onAfterCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'added' }>;
  selectionType?: DiffSelectionType | undefined;
  onToggleSelection?: (() => void) | undefined;
  afterCommentButton?: ReactNode;
  afterCommentHighlighted?: boolean;
  onAfterCommentLaneEnter?: (() => void) | undefined;
}) {
  const syntaxTokens = getHighlightTokensForLine(row.data.lineNumber, file.syntaxTokens?.newTokens);

  return (
    <div className="flex">
      {selectionType ? (
        <div className={SELECTION_GUTTER_CLASS}>
          <SelectionToggle selectionType={selectionType} onClick={onToggleSelection} />
        </div>
      ) : null}
      <div className="grid min-w-0 flex-1 grid-cols-2">
        <DiffColumn
          oldLineNumber={null}
          newLineNumber={null}
          marker=""
          className="bg-background"
          content=""
        />
        <DiffColumn
          oldLineNumber={null}
          newLineNumber={row.data.lineNumber}
          marker="+"
          className="bg-emerald-500/12"
          content={renderHighlightedText(row.data.content, [syntaxTokens])}
          commentButton={afterCommentButton}
          commentHighlighted={afterCommentHighlighted}
          onCommentLaneEnter={onAfterCommentLaneEnter}
        />
      </div>
    </div>
  );
}

function ModifiedRow({
  file,
  row,
  selectionType,
  onToggleSelection,
  beforeCommentButton,
  afterCommentButton,
  beforeCommentHighlighted = false,
  afterCommentHighlighted = false,
  onBeforeCommentLaneEnter,
  onAfterCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'modified' }>;
  selectionType?: DiffSelectionType | undefined;
  onToggleSelection?: (() => void) | undefined;
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
    <div className="flex">
      {selectionType ? (
        <div className={SELECTION_GUTTER_CLASS}>
          <SelectionToggle selectionType={selectionType} onClick={onToggleSelection} />
        </div>
      ) : null}
      <div className="grid min-w-0 flex-1 grid-cols-2">
        <DiffColumn
          oldLineNumber={row.before.lineNumber}
          newLineNumber={null}
          marker="-"
          className="bg-rose-500/12"
          content={renderHighlightedText(row.before.content, [
            beforeSyntaxTokens,
            intraLineTokens?.before,
          ])}
          commentButton={beforeCommentButton}
          commentHighlighted={beforeCommentHighlighted}
          onCommentLaneEnter={onBeforeCommentLaneEnter}
        />
        <DiffColumn
          oldLineNumber={null}
          newLineNumber={row.after.lineNumber}
          marker="+"
          className="bg-emerald-500/12"
          content={renderHighlightedText(row.after.content, [
            afterSyntaxTokens,
            intraLineTokens?.after,
          ])}
          commentButton={afterCommentButton}
          commentHighlighted={afterCommentHighlighted}
          onCommentLaneEnter={onAfterCommentLaneEnter}
        />
      </div>
    </div>
  );
}

function UnifiedContextRow({
  file,
  row,
  selectionType,
  afterCommentButton,
  afterCommentHighlighted = false,
  onAfterCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'context' }>;
  selectionType?: DiffSelectionType | undefined;
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
      selectionType={selectionType}
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
  selectionType,
  onToggleSelection,
  beforeCommentButton,
  beforeCommentHighlighted = false,
  onBeforeCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'deleted' }>;
  selectionType?: DiffSelectionType | undefined;
  onToggleSelection?: (() => void) | undefined;
  beforeCommentButton?: ReactNode;
  beforeCommentHighlighted?: boolean;
  onBeforeCommentLaneEnter?: (() => void) | undefined;
}) {
  const syntaxTokens = getHighlightTokensForLine(row.data.lineNumber, file.syntaxTokens?.oldTokens);

  return (
    <UnifiedLine
      oldLineNumber={row.data.lineNumber}
      newLineNumber={null}
      marker="-"
      className="bg-rose-500/12"
      selectionType={selectionType}
      onToggleSelection={onToggleSelection}
      content={renderHighlightedText(row.data.content, [syntaxTokens])}
      commentButton={beforeCommentButton}
      commentHighlighted={beforeCommentHighlighted}
      onCommentLaneEnter={onBeforeCommentLaneEnter}
    />
  );
}

function UnifiedAddedRow({
  file,
  row,
  selectionType,
  onToggleSelection,
  afterCommentButton,
  afterCommentHighlighted = false,
  onAfterCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'added' }>;
  selectionType?: DiffSelectionType | undefined;
  onToggleSelection?: (() => void) | undefined;
  afterCommentButton?: ReactNode;
  afterCommentHighlighted?: boolean;
  onAfterCommentLaneEnter?: (() => void) | undefined;
}) {
  const syntaxTokens = getHighlightTokensForLine(row.data.lineNumber, file.syntaxTokens?.newTokens);

  return (
    <UnifiedLine
      oldLineNumber={null}
      newLineNumber={row.data.lineNumber}
      marker="+"
      className="bg-emerald-500/12"
      selectionType={selectionType}
      onToggleSelection={onToggleSelection}
      content={renderHighlightedText(row.data.content, [syntaxTokens])}
      commentButton={afterCommentButton}
      commentHighlighted={afterCommentHighlighted}
      onCommentLaneEnter={onAfterCommentLaneEnter}
    />
  );
}

function UnifiedModifiedRow({
  file,
  row,
  selectionType,
  onToggleSelection,
  beforeCommentButton,
  afterCommentButton,
  beforeCommentHighlighted = false,
  afterCommentHighlighted = false,
  onBeforeCommentLaneEnter,
  onAfterCommentLaneEnter,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'modified' }>;
  selectionType?: DiffSelectionType | undefined;
  onToggleSelection?: (() => void) | undefined;
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
    <>
      <UnifiedLine
        oldLineNumber={row.before.lineNumber}
        newLineNumber={null}
        marker="-"
        className="bg-rose-500/12"
        selectionType={selectionType}
        onToggleSelection={onToggleSelection}
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
        selectionType={selectionType}
        onToggleSelection={onToggleSelection}
        content={renderHighlightedText(row.after.content, [
          afterSyntaxTokens,
          intraLineTokens?.after,
        ])}
        commentButton={afterCommentButton}
        commentHighlighted={afterCommentHighlighted}
        onCommentLaneEnter={onAfterCommentLaneEnter}
      />
    </>
  );
}

function DiffBodyRow({
  displayMode,
  file,
  row,
  selectionType,
  onToggleSelection,
  onToggleHunkSelection,
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
  onToggleSelection?: (() => void) | undefined;
  onToggleHunkSelection?: ((hunkStartLineNumber: number) => void) | undefined;
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
            selectionType && onToggleHunkSelection
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
              selectionType={selectionType}
              afterCommentButton={afterCommentButton}
              afterCommentHighlighted={afterCommentHighlighted}
              onAfterCommentLaneEnter={onAfterCommentLaneEnter}
            />
          )
        : (
            <ContextRow
              file={file}
              row={row}
              selectionType={selectionType}
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
              selectionType={selectionType}
              onToggleSelection={onToggleSelection}
              beforeCommentButton={beforeCommentButton}
              beforeCommentHighlighted={beforeCommentHighlighted}
              onBeforeCommentLaneEnter={onBeforeCommentLaneEnter}
            />
          )
        : (
            <DeletedRow
              file={file}
              row={row}
              selectionType={selectionType}
              onToggleSelection={onToggleSelection}
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
              selectionType={selectionType}
              onToggleSelection={onToggleSelection}
              afterCommentButton={afterCommentButton}
              afterCommentHighlighted={afterCommentHighlighted}
              onAfterCommentLaneEnter={onAfterCommentLaneEnter}
            />
          )
        : (
            <AddedRow
              file={file}
              row={row}
              selectionType={selectionType}
              onToggleSelection={onToggleSelection}
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
              selectionType={selectionType}
              onToggleSelection={onToggleSelection}
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
              selectionType={selectionType}
              onToggleSelection={onToggleSelection}
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
  hideHeader = false,
}: {
  file: DiffRenderFile;
  displayMode: DiffDisplayMode;
  sectionRef: (el: HTMLDivElement | null) => void;
  selectionType?: DiffSelectionType | undefined;
  getRowSelectionType?: ((row: DiffRenderFile['rows'][number]) => DiffSelectionType) | undefined;
  getHunkSelectionType?: ((hunkStartLineNumber: number) => DiffSelectionType) | undefined;
  onToggleFileSelection?: (() => void) | undefined;
  onToggleRowSelection?: ((row: DiffRenderFile['rows'][number]) => void) | undefined;
  onToggleHunkSelection?: ((hunkStartLineNumber: number) => void) | undefined;
  onSubmitComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
  hideHeader?: boolean | undefined;
}) {
  const config = FILE_STATUS_CONFIG[file.status];
  const [commentDraft, setCommentDraft] = useState<DiffCommentDraft | null>(null);

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

  const commentRows = useMemo(
    () =>
      commentRange === null
        ? []
        : file.rows
            .slice(commentRange.from, commentRange.to + 1)
            .filter((row) =>
              commentDraft === null
                ? false
                : getCommentableLineNumber(row, commentDraft.side) !== null,
            ),
    [commentDraft, commentRange, file.rows],
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

  return (
    <div
      ref={sectionRef}
      data-file-path={file.path}
      className="overflow-hidden rounded-lg border border-border bg-background shadow-[0_1px_0_color-mix(in_oklab,var(--border),transparent_35%)]"
    >
      {!hideHeader ? (
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-muted/85 px-3 py-1.5 backdrop-blur-sm">
          {selectionType ? (
            <SelectionToggle
              selectionType={selectionType}
              onClick={onToggleFileSelection}
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
          {file.rows.map((row, rowIndex) => {
            const key =
              row.kind === 'hunk'
                ? `hunk:${row.originalStartLineNumber}`
                : row.kind === 'context'
                ? `context:${row.originalDiffLineNumber}`
                : row.kind === 'modified'
                ? `modified:${row.before.originalDiffLineNumber}:${row.after.originalDiffLineNumber}`
                : `${row.kind}:${row.data.originalDiffLineNumber}`;
            const showComposer =
              commentDraft !== null &&
              commentDraft.isSelecting === false &&
              commentRange !== null &&
              rowIndex === commentRange.to;

            return (
              <div key={key}>
                <DiffBodyRow
                  displayMode={displayMode}
                  file={file}
                  row={row}
                  selectionType={
                    row.kind === 'hunk'
                      ? getHunkSelectionType?.(row.originalStartLineNumber)
                      : getRowSelectionType?.(row)
                  }
                  onToggleSelection={onToggleRowSelection ? () => onToggleRowSelection(row) : undefined}
                  onToggleHunkSelection={onToggleHunkSelection}
                  beforeCommentButton={getCommentButton('old', row, rowIndex)}
                  afterCommentButton={getCommentButton('new', row, rowIndex)}
                  onBeforeCommentLaneEnter={() => handleExtendCommentSelection('old', rowIndex)}
                  onAfterCommentLaneEnter={() => handleExtendCommentSelection('new', rowIndex)}
                  beforeCommentHighlighted={
                    commentDraft !== null &&
                    commentDraft.side === 'old' &&
                    commentRange !== null &&
                    rowIndex >= commentRange.from &&
                    rowIndex <= commentRange.to &&
                    getCommentableLineNumber(row, 'old') !== null
                  }
                  afterCommentHighlighted={
                    commentDraft !== null &&
                    commentDraft.side === 'new' &&
                    commentRange !== null &&
                    rowIndex >= commentRange.from &&
                    rowIndex <= commentRange.to &&
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
