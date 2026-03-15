import type { ReactNode } from 'react';

import { FileCodeIcon } from 'lucide-react';

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

function HunkRow({ content }: { content: string }) {
  return (
    <div className="border-y border-border/50 bg-muted/70 px-4 py-1 font-mono text-[12px] text-muted-foreground">
      {content}
    </div>
  );
}

function ContextRow({ file, row }: { file: DiffRenderFile; row: Extract<DiffRenderFile['rows'][number], { kind: 'context' }> }) {
  const oldTokens = getHighlightTokensForLine(row.beforeLineNumber, file.syntaxTokens?.oldTokens);
  const newTokens = getHighlightTokensForLine(row.afterLineNumber, file.syntaxTokens?.newTokens);
  const fallbackTokens = oldTokens ?? newTokens;

  return (
    <div className="grid grid-cols-2">
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
  );
}

function DeletedRow({ file, row }: { file: DiffRenderFile; row: Extract<DiffRenderFile['rows'][number], { kind: 'deleted' }> }) {
  const syntaxTokens = getHighlightTokensForLine(row.data.lineNumber, file.syntaxTokens?.oldTokens);

  return (
    <div className="grid grid-cols-2">
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
  );
}

function AddedRow({ file, row }: { file: DiffRenderFile; row: Extract<DiffRenderFile['rows'][number], { kind: 'added' }> }) {
  const syntaxTokens = getHighlightTokensForLine(row.data.lineNumber, file.syntaxTokens?.newTokens);

  return (
    <div className="grid grid-cols-2">
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
  );
}

function ModifiedRow({ file, row }: { file: DiffRenderFile; row: Extract<DiffRenderFile['rows'][number], { kind: 'modified' }> }) {
  const beforeSyntaxTokens = getHighlightTokensForLine(row.before.lineNumber, file.syntaxTokens?.oldTokens);
  const afterSyntaxTokens = getHighlightTokensForLine(row.after.lineNumber, file.syntaxTokens?.newTokens);
  const intraLineTokens = row.canIntraLineDiff
    ? getIntraLineDiffTokens(row.before.content, row.after.content)
    : null;

  return (
    <div className="grid grid-cols-2">
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
  );
}

function DiffBodyRow({ file, row }: { file: DiffRenderFile; row: DiffRenderFile['rows'][number] }) {
  switch (row.kind) {
    case 'hunk':
      return <HunkRow content={row.content} />;
    case 'context':
      return <ContextRow file={file} row={row} />;
    case 'deleted':
      return <DeletedRow file={file} row={row} />;
    case 'added':
      return <AddedRow file={file} row={row} />;
    case 'modified':
      return <ModifiedRow file={file} row={row} />;
  }
}

export function DiffFileSection({
  file,
  sectionRef,
}: {
  file: DiffRenderFile;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  const config = FILE_STATUS_CONFIG[file.status];

  return (
    <div
      ref={sectionRef}
      data-file-path={file.path}
      className="overflow-hidden rounded-lg border border-border bg-background shadow-[0_1px_0_color-mix(in_oklab,var(--border),transparent_35%)]"
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-muted/85 px-3 py-1.5 backdrop-blur-sm">
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
            />
          ))}
        </div>
      </div>
    </div>
  );
}
