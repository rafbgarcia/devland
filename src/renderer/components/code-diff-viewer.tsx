import { useMemo } from 'react';

import { FileCodeIcon } from 'lucide-react';

import { Spinner } from '@/shadcn/components/ui/spinner';
import { cn } from '@/shadcn/lib/utils';

type DiffLineType = 'addition' | 'deletion' | 'context';

type ParsedDiffLine = {
  type: DiffLineType;
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
};

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function parseDiff(raw: string): ParsedDiffLine[] {
  const lines = raw.split('\n');
  const result: ParsedDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    const hunkMatch = line.match(HUNK_HEADER_RE);

    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1]!, 10);
      newLine = parseInt(hunkMatch[2]!, 10);

      continue;
    }

    if (
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('---') ||
      line.startsWith('+++') ||
      line.startsWith('new file') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode') ||
      line.startsWith('similarity') ||
      line.startsWith('rename') ||
      line.startsWith('deleted file') ||
      line.startsWith('\\ No newline')
    ) {
      continue;
    }

    if (line.startsWith('+')) {
      result.push({
        type: 'addition',
        content: line.slice(1),
        oldLineNumber: null,
        newLineNumber: newLine,
      });
      newLine++;

      continue;
    }

    if (line.startsWith('-')) {
      result.push({
        type: 'deletion',
        content: line.slice(1),
        oldLineNumber: oldLine,
        newLineNumber: null,
      });
      oldLine++;

      continue;
    }

    // Context line (starts with space or is empty after headers)
    if (oldLine > 0 || newLine > 0) {
      result.push({
        type: 'context',
        content: line.startsWith(' ') ? line.slice(1) : line,
        oldLineNumber: oldLine,
        newLineNumber: newLine,
      });
      oldLine++;
      newLine++;
    }
  }

  return result;
}

const LINE_STYLES: Record<DiffLineType, { row: string; gutter: string }> = {
  addition: {
    row: 'bg-green-500/10',
    gutter: 'bg-green-500/15 text-green-700 dark:text-green-400',
  },
  deletion: {
    row: 'bg-red-500/10',
    gutter: 'bg-red-500/15 text-red-700 dark:text-red-400',
  },
  context: {
    row: '',
    gutter: 'text-muted-foreground/60',
  },
};

function DiffRow({ line }: { line: ParsedDiffLine }) {
  const style = LINE_STYLES[line.type];

  return (
    <div className={cn('flex font-mono text-[13px] leading-[22px]', style.row)}>
      {/* Old line number gutter */}
      <span
        className={cn(
          'inline-block w-[52px] shrink-0 select-none border-r border-border/40 pr-2 text-right',
          style.gutter,
        )}
      >
        {line.oldLineNumber ?? ''}
      </span>
      {/* New line number gutter */}
      <span
        className={cn(
          'inline-block w-[52px] shrink-0 select-none border-r border-border/40 pr-2 text-right',
          style.gutter,
        )}
      >
        {line.newLineNumber ?? ''}
      </span>
      {/* Diff marker */}
      <span
        className={cn(
          'inline-block w-5 shrink-0 select-none text-center',
          line.type === 'addition' && 'text-green-700 dark:text-green-400',
          line.type === 'deletion' && 'text-red-700 dark:text-red-400',
        )}
      >
        {line.type === 'addition' ? '+' : line.type === 'deletion' ? '-' : ''}
      </span>
      {/* Content */}
      <span className="flex-1 whitespace-pre px-1">
        {line.content || '\u00A0'}
      </span>
    </div>
  );
}

export function CodeDiffViewer({
  filePath,
  diff,
  isLoading,
}: {
  filePath: string | null;
  diff: string | null;
  isLoading: boolean;
}) {
  const parsedLines = useMemo(
    () => (diff ? parseDiff(diff) : []),
    [diff],
  );

  if (filePath === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Select a file to view changes
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          Loading diff...
        </div>
      </div>
    );
  }

  if (parsedLines.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No changes to display
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* File header */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-1.5">
        <FileCodeIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{filePath}</span>
      </div>
      {/* Diff body */}
      <div className="flex-1 overflow-auto">
        {parsedLines.map((line, i) => (
          <DiffRow key={i} line={line} />
        ))}
      </div>
    </div>
  );
}
