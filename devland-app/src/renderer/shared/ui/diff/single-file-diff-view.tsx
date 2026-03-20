import { memo, useCallback, type ReactNode } from 'react';

import type {
  DiffCommentAnchor,
  DiffSelectionSide,
  DiffSelectionType,
} from '@/lib/diff';
import type { AsyncState } from '@/renderer/shared/ui/diff/diff-types';
import type { DiffRenderFile } from '@/renderer/shared/ui/diff/use-diff-render-files';
import { Spinner } from '@/shadcn/components/ui/spinner';

import { DiffFileSection } from './diff-renderer';
import type { DiffExpansionAction, DiffExpansionGap, DiffFileExpansionState } from './diff-expansion';

export const SingleFileDiffView = memo(function SingleFileDiffView({
  rawDiff,
  selectedFile,
  topContent,
  emptyMessage,
  getRowSelectionType,
  getHunkSelectionType,
  onToggleRowSelection,
  onToggleHunkSelection,
  onSubmitComment,
  expansionState,
  onExpandGap,
}: {
  rawDiff: AsyncState<string>;
  selectedFile: DiffRenderFile | null;
  topContent?: ReactNode;
  emptyMessage: string;
  getRowSelectionType?: ((
    path: string,
    row: DiffRenderFile['rows'][number],
    side?: DiffSelectionSide,
  ) => DiffSelectionType) | undefined;
  getHunkSelectionType?: ((path: string, hunkStartLineNumber: number) => DiffSelectionType) | undefined;
  onToggleRowSelection?: ((
    path: string,
    row: DiffRenderFile['rows'][number],
    side?: DiffSelectionSide,
  ) => void) | undefined;
  onToggleHunkSelection?: ((path: string, hunkStartLineNumber: number) => void) | undefined;
  onSubmitComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
  expansionState?: DiffFileExpansionState | undefined;
  onExpandGap?: ((gap: DiffExpansionGap, action: DiffExpansionAction) => void) | undefined;
}) {
  const handleSectionRef = useCallback(() => {}, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {topContent}

      {rawDiff.status === 'loading' ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3.5" />
            Loading diff...
          </div>
        </div>
      ) : null}

      {rawDiff.status === 'error' ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-destructive">{rawDiff.error}</p>
        </div>
      ) : null}

      {rawDiff.status === 'ready' && selectedFile === null ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : null}

      {rawDiff.status === 'ready' && selectedFile !== null ? (
        <div className="flex-1 overflow-auto">
          <DiffFileSection
            file={selectedFile}
            sectionRef={handleSectionRef}
            getRowSelectionType={getRowSelectionType
              ? (row, side) => getRowSelectionType(selectedFile.path, row, side)
              : undefined}
            getHunkSelectionType={getHunkSelectionType ? (hunkStartLineNumber) => getHunkSelectionType(selectedFile.path, hunkStartLineNumber) : undefined}
            onToggleRowSelection={onToggleRowSelection
              ? (row, side) => onToggleRowSelection(selectedFile.path, row, side)
              : undefined}
            onToggleHunkSelection={onToggleHunkSelection ? (hunkStartLineNumber) => onToggleHunkSelection(selectedFile.path, hunkStartLineNumber) : undefined}
            onSubmitComment={onSubmitComment}
            expansionState={expansionState}
            onExpandGap={onExpandGap}
          />
        </div>
      ) : null}
    </div>
  );
});
