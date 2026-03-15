import type { ReactNode } from 'react';

import { CheckIcon, FileCodeIcon, MinusIcon } from 'lucide-react';

import type { DiffSelectionType } from '@/lib/diff';
import type { DiffRenderFile } from '@/renderer/hooks/use-diff-render-files';
import {
  getHighlightTokensForLine,
  getIntraLineDiffTokens,
  renderHighlightedText,
} from '@/renderer/lib/diff/render-highlighted-text';
import { cn } from '@/shadcn/lib/utils';

const ROW_BASE_CLASS = 'font-mono text-[13px] leading-[22px]';
const GUTTER_CLASS =
  'w-[52px] shrink-0 select-none border-r border-border/40 px-2 text-right text-[12px] text-muted-foreground/75';
const MARKER_CLASS = 'w-5 shrink-0 select-none text-center text-[12px]';
const SELECTION_GUTTER_CLASS =
  'flex w-10 shrink-0 items-stretch justify-center border-r border-border/50 bg-muted/30';

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
}: {
  oldLineNumber: number | null;
  newLineNumber: number | null;
  marker: string;
  content: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 border-r border-border/50 last:border-r-0', className)}>
      <div className={cn('flex min-w-0', ROW_BASE_CLASS)}>
        <span className={GUTTER_CLASS}>{oldLineNumber ?? ''}</span>
        <span className={GUTTER_CLASS}>{newLineNumber ?? ''}</span>
        <span className={MARKER_CLASS}>{marker}</span>
        <span className="diff-syntax min-w-0 flex-1 overflow-hidden whitespace-pre px-2">
          {content}
        </span>
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

function ContextRow({
  file,
  row,
  selectionType,
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'context' }>;
  selectionType?: DiffSelectionType | undefined;
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
        />
        <DiffColumn
          oldLineNumber={row.beforeLineNumber}
          newLineNumber={row.afterLineNumber}
          marker=""
          content={renderHighlightedText(row.content, [newTokens ?? oldTokens])}
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
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'deleted' }>;
  selectionType?: DiffSelectionType | undefined;
  onToggleSelection?: (() => void) | undefined;
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
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'added' }>;
  selectionType?: DiffSelectionType | undefined;
  onToggleSelection?: (() => void) | undefined;
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
}: {
  file: DiffRenderFile;
  row: Extract<DiffRenderFile['rows'][number], { kind: 'modified' }>;
  selectionType?: DiffSelectionType | undefined;
  onToggleSelection?: (() => void) | undefined;
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
        />
      </div>
    </div>
  );
}

function DiffBodyRow({
  file,
  row,
  selectionType,
  onToggleSelection,
  onToggleHunkSelection,
}: {
  file: DiffRenderFile;
  row: DiffRenderFile['rows'][number];
  selectionType?: DiffSelectionType | undefined;
  onToggleSelection?: (() => void) | undefined;
  onToggleHunkSelection?: ((hunkStartLineNumber: number) => void) | undefined;
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
      return <ContextRow file={file} row={row} selectionType={selectionType} />;
    case 'deleted':
      return <DeletedRow file={file} row={row} selectionType={selectionType} onToggleSelection={onToggleSelection} />;
    case 'added':
      return <AddedRow file={file} row={row} selectionType={selectionType} onToggleSelection={onToggleSelection} />;
    case 'modified':
      return <ModifiedRow file={file} row={row} selectionType={selectionType} onToggleSelection={onToggleSelection} />;
  }
}

export function DiffFileSection({
  file,
  sectionRef,
  selectionType,
  getRowSelectionType,
  getHunkSelectionType,
  onToggleFileSelection,
  onToggleRowSelection,
  onToggleHunkSelection,
}: {
  file: DiffRenderFile;
  sectionRef: (el: HTMLDivElement | null) => void;
  selectionType?: DiffSelectionType | undefined;
  getRowSelectionType?: ((row: DiffRenderFile['rows'][number]) => DiffSelectionType) | undefined;
  getHunkSelectionType?: ((hunkStartLineNumber: number) => DiffSelectionType) | undefined;
  onToggleFileSelection?: (() => void) | undefined;
  onToggleRowSelection?: ((row: DiffRenderFile['rows'][number]) => void) | undefined;
  onToggleHunkSelection?: ((hunkStartLineNumber: number) => void) | undefined;
}) {
  const config = FILE_STATUS_CONFIG[file.status];

  return (
    <div
      ref={sectionRef}
      data-file-path={file.path}
      className="overflow-hidden rounded-lg border border-border bg-background shadow-[0_1px_0_color-mix(in_oklab,var(--border),transparent_35%)]"
    >
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
      <div className="overflow-x-auto">
        <div className="min-w-[960px]">
          {file.rows.map((row) => (
            <DiffBodyRow
              key={
                row.kind === 'hunk'
                  ? `hunk:${row.originalStartLineNumber}`
                  : row.kind === 'context'
                  ? `context:${row.originalDiffLineNumber}`
                  : row.kind === 'modified'
                  ? `modified:${row.before.originalDiffLineNumber}:${row.after.originalDiffLineNumber}`
                  : `${row.kind}:${row.data.originalDiffLineNumber}`
              }
              file={file}
              row={row}
              selectionType={
                row.kind === 'hunk'
                  ? getHunkSelectionType?.(row.originalStartLineNumber)
                  : getRowSelectionType?.(row)
              }
              onToggleSelection={onToggleRowSelection ? () => onToggleRowSelection(row) : undefined}
              onToggleHunkSelection={onToggleHunkSelection}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
