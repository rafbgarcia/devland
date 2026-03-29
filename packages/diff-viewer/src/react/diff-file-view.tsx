import { useMemo, useState } from 'react';

import {
  type AnnotationSide,
  FileDiff,
  type DiffLineAnnotation,
  type FileDiffMetadata,
  type SelectionSide,
} from '@pierre/diffs/react';
import type { CSSProperties, ReactNode } from 'react';

import { buildDiffCommentAnchor } from '../lib/comment-anchor.js';
import type {
  DiffCommentAnchor,
  DiffCommentSide,
  DiffFile,
  DiffRow,
} from '../lib/types.js';

const COMMENT_BOX_STYLE: CSSProperties = {
  marginTop: 8,
  border: '1px solid color-mix(in srgb, currentColor 12%, transparent)',
  borderRadius: 10,
  background: 'color-mix(in srgb, canvas 92%, currentColor 1%)',
  overflow: 'hidden',
};

const COMMENT_HEADER_STYLE: CSSProperties = {
  padding: '6px 10px',
  fontSize: 11,
  opacity: 0.7,
  borderBottom: '1px solid color-mix(in srgb, currentColor 10%, transparent)',
};

const COMMENT_BODY_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 10,
};

const COMMENT_TEXTAREA_STYLE: CSSProperties = {
  width: '100%',
  minHeight: 72,
  resize: 'vertical',
  borderRadius: 8,
  border: '1px solid color-mix(in srgb, currentColor 14%, transparent)',
  background: 'canvas',
  color: 'inherit',
  padding: 10,
  font: 'inherit',
};

const COMMENT_ACTIONS_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
};

const COMMENT_BUTTON_STYLE: CSSProperties = {
  borderRadius: 8,
  border: '1px solid color-mix(in srgb, currentColor 14%, transparent)',
  padding: '6px 10px',
  font: 'inherit',
  cursor: 'pointer',
  background: 'canvas',
  color: 'inherit',
};

type CommentDraft = {
  range: SelectedLineRange;
  side: DiffCommentSide;
  rows: readonly DiffRow[];
  body: string;
  error: string | null;
  isSubmitting: boolean;
};

type SelectedLineRange = {
  start: number;
  side?: SelectionSide;
  end: number;
  endSide?: SelectionSide;
};

function getRangeSide(range: SelectedLineRange): DiffCommentSide {
  return (range.side ?? 'additions') === 'deletions' ? 'old' : 'new';
}

function normalizeRange(range: SelectedLineRange) {
  return {
    start: Math.min(range.start, range.end),
    end: Math.max(range.start, range.end),
  };
}

function getCommentRowsForRange(file: DiffFile, range: SelectedLineRange) {
  const side = getRangeSide(range);
  const normalizedRange = normalizeRange(range);
  const rows = file.rows.filter((row) => {
    switch (row.kind) {
      case 'hunk':
        return false;
      case 'context': {
        const lineNumber = side === 'old' ? row.beforeLineNumber : row.afterLineNumber;
        return lineNumber >= normalizedRange.start && lineNumber <= normalizedRange.end;
      }
      case 'deleted':
        return side === 'old' &&
          row.data.lineNumber >= normalizedRange.start &&
          row.data.lineNumber <= normalizedRange.end;
      case 'added':
        return side === 'new' &&
          row.data.lineNumber >= normalizedRange.start &&
          row.data.lineNumber <= normalizedRange.end;
      case 'modified': {
        const lineNumber = side === 'old' ? row.before.lineNumber : row.after.lineNumber;
        return lineNumber >= normalizedRange.start && lineNumber <= normalizedRange.end;
      }
    }
  });

  return { side, rows };
}

function InlineCommentComposer({
  lineRangeLabel,
  body,
  error,
  isSubmitting,
  onBodyChange,
  onCancel,
  onSubmit,
}: {
  lineRangeLabel: string;
  body: string;
  error: string | null;
  isSubmitting: boolean;
  onBodyChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div style={COMMENT_BOX_STYLE}>
      <div style={COMMENT_HEADER_STYLE}>{lineRangeLabel}</div>
      <div style={COMMENT_BODY_STYLE}>
        {error ? (
          <div style={{ color: '#c2410c', fontSize: 12 }}>{error}</div>
        ) : null}
        <textarea
          value={body}
          onChange={(event) => onBodyChange(event.target.value)}
          placeholder="Leave a comment"
          disabled={isSubmitting}
          style={COMMENT_TEXTAREA_STYLE}
        />
        <div style={COMMENT_ACTIONS_STYLE}>
          <button type="button" onClick={onCancel} disabled={isSubmitting} style={COMMENT_BUTTON_STYLE}>
            Cancel
          </button>
          <button type="button" onClick={onSubmit} disabled={isSubmitting} style={COMMENT_BUTTON_STYLE}>
            {isSubmitting ? 'Saving...' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DiffFileView({
  file,
  onSubmitComment,
  emptyMessage = null,
  className,
  style,
}: {
  file: DiffFile | null;
  onSubmitComment?: ((anchor: DiffCommentAnchor, body: string) => Promise<void>) | undefined;
  emptyMessage?: ReactNode;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}) {
  const [commentDraft, setCommentDraft] = useState<CommentDraft | null>(null);

  const annotations = useMemo(() => {
    if (commentDraft === null) {
      return [] as DiffLineAnnotation<CommentDraft>[];
    }

    const anchor = buildDiffCommentAnchor(file!, commentDraft.rows, commentDraft.side);
    if (!anchor) {
      return [] as DiffLineAnnotation<CommentDraft>[];
    }

    return [{
      side: (commentDraft.side === 'old' ? 'deletions' : 'additions') as AnnotationSide,
      lineNumber: anchor.endLine,
      metadata: commentDraft,
    }];
  }, [commentDraft, file]);

  if (file === null) {
    return <div className={className} style={style}>{emptyMessage}</div>;
  }

  if (file.kind === 'binary' || file.metadata === null) {
    return (
      <div className={className} style={style}>
        <div
          style={{
            border: '1px solid color-mix(in srgb, currentColor 12%, transparent)',
            borderRadius: 12,
            padding: 16,
            opacity: 0.8,
          }}
        >
          Binary diff preview is not available for this file.
        </div>
      </div>
    );
  }

  const options = {
    diffStyle: 'unified' as const,
    disableFileHeader: true,
    lineHoverHighlight: 'number' as const,
    enableGutterUtility: onSubmitComment !== undefined,
    ...(onSubmitComment ? {
      onGutterUtilityClick: (range: SelectedLineRange) => {
          const { side, rows } = getCommentRowsForRange(file, range);
          if (rows.length === 0) {
            return;
          }

          setCommentDraft({
            range,
            side,
            rows,
            body: '',
            error: null,
            isSubmitting: false,
          });
        },
      }
      : {}),
  };

  const selectedLines = commentDraft?.range ?? null;

  return (
    <div className={className} style={style}>
      <FileDiff<CommentDraft>
        fileDiff={file.metadata as FileDiffMetadata}
        options={options}
        selectedLines={selectedLines}
        lineAnnotations={annotations}
        renderAnnotation={(annotation: DiffLineAnnotation<CommentDraft>) => {
          const anchor = buildDiffCommentAnchor(file, annotation.metadata.rows, annotation.metadata.side);
          if (anchor === null) {
            return null;
          }

          const lineRangeLabel = anchor.startLine === anchor.endLine
            ? `${anchor.side === 'old' ? 'Old' : 'New'} line ${anchor.startLine}`
            : `${anchor.side === 'old' ? 'Old' : 'New'} lines ${anchor.startLine}-${anchor.endLine}`;

          return (
            <InlineCommentComposer
              lineRangeLabel={lineRangeLabel}
              body={annotation.metadata.body}
              error={annotation.metadata.error}
              isSubmitting={annotation.metadata.isSubmitting}
              onBodyChange={(body) => {
                setCommentDraft((current: CommentDraft | null) => current === null ? current : { ...current, body, error: null });
              }}
              onCancel={() => setCommentDraft(null)}
              onSubmit={async () => {
                if (!onSubmitComment) {
                  return;
                }

                const latestAnchor = buildDiffCommentAnchor(file, annotation.metadata.rows, annotation.metadata.side);
                if (latestAnchor === null) {
                  return;
                }

                const body = annotation.metadata.body.trim();
                if (body.length === 0) {
                  setCommentDraft((current: CommentDraft | null) =>
                    current === null ? current : { ...current, error: 'Comment body is required.' }
                  );
                  return;
                }

                setCommentDraft((current: CommentDraft | null) =>
                  current === null ? current : { ...current, isSubmitting: true, error: null }
                );

                try {
                  await onSubmitComment(latestAnchor, body);
                  setCommentDraft(null);
                } catch (error) {
                  setCommentDraft((current: CommentDraft | null) =>
                    current === null
                      ? current
                      : {
                          ...current,
                          isSubmitting: false,
                          error: error instanceof Error ? error.message : 'Comment failed.',
                        }
                  );
                }
              }}
            />
          );
        }}
      />
    </div>
  );
}
