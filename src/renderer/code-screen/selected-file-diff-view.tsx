import { memo, useCallback } from 'react';

import type {
  DiffCommentAnchor,
  DiffDisplayMode,
  DiffSelectionSide,
  DiffSelectionType,
} from '@/lib/diff';
import { DiffDisplayModeToolbar } from '@/renderer/shared/ui/diff/diff-display-mode-toolbar';
import { DiffFileSection } from '@/renderer/shared/ui/diff/diff-renderer';
import type { AsyncState } from '@/renderer/shared/ui/diff/diff-types';
import { useDiffExpansionState } from '@/renderer/shared/ui/diff/use-diff-expansion-state';
import type { DiffRenderFile } from '@/renderer/shared/ui/diff/use-diff-render-files';
import { Spinner } from '@/shadcn/components/ui/spinner';

export const SelectedFileDiffView = memo(function SelectedFileDiffView({
  rawDiff,
  selectedFile,
  displayMode,
  emptyMessage,
  getFileSelectionType,
  getRowSelectionType,
  getHunkSelectionType,
  onToggleFileSelection,
  onToggleRowSelection,
  onToggleHunkSelection,
  onSubmitComment,
}: {
  rawDiff: AsyncState<string>;
  selectedFile: DiffRenderFile | null;
  displayMode: DiffDisplayMode;
  emptyMessage: string;
  getFileSelectionType?: ((path: string) => DiffSelectionType) | undefined;
  getRowSelectionType?: ((
    path: string,
    row: DiffRenderFile['rows'][number],
    side?: DiffSelectionSide,
  ) => DiffSelectionType) | undefined;
  getHunkSelectionType?: ((path: string, hunkStartLineNumber: number) => DiffSelectionType) | undefined;
  onToggleFileSelection?: ((path: string) => void) | undefined;
  onToggleRowSelection?: ((
    path: string,
    row: DiffRenderFile['rows'][number],
    side?: DiffSelectionSide,
  ) => void) | undefined;
  onToggleHunkSelection?: ((path: string, hunkStartLineNumber: number) => void) | undefined;
  onSubmitComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
}) {
  const handleSectionRef = useCallback(() => {}, []);
  const { getFileExpansionState, expandFileGap } = useDiffExpansionState(rawDiff);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <DiffDisplayModeToolbar />

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
            displayMode={displayMode}
            sectionRef={handleSectionRef}
            selectionType={getFileSelectionType?.(selectedFile.path)}
            getRowSelectionType={getRowSelectionType
              ? (row, side) => getRowSelectionType(selectedFile.path, row, side)
              : undefined}
            getHunkSelectionType={getHunkSelectionType ? (hunkStartLineNumber) => getHunkSelectionType(selectedFile.path, hunkStartLineNumber) : undefined}
            onToggleFileSelection={onToggleFileSelection ? () => onToggleFileSelection(selectedFile.path) : undefined}
            onToggleRowSelection={onToggleRowSelection
              ? (row, side) => onToggleRowSelection(selectedFile.path, row, side)
              : undefined}
            onToggleHunkSelection={onToggleHunkSelection ? (hunkStartLineNumber) => onToggleHunkSelection(selectedFile.path, hunkStartLineNumber) : undefined}
            onSubmitComment={onSubmitComment}
            expansionState={getFileExpansionState(selectedFile.path)}
            onExpandGap={(gap, action) => expandFileGap(selectedFile.path, gap, action)}
          />
        </div>
      ) : null}
    </div>
  );
});
