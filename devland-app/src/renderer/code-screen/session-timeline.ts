import type {
  CodexChatMessage,
  CodexSessionActivity,
  CodexSessionState,
  CodexTranscriptEntry,
} from '@/renderer/code-screen/codex-session-state';
import {
  buildCollapsedProposedPlanPreviewMarkdown,
  parseProposedPlanMessage,
} from '@/renderer/code-screen/proposed-plan';

export type SessionTimelineToolEntry = {
  id: string;
  label: string;
  detail: string | null;
  tone: 'info' | 'tool' | 'error';
  itemType: string | null;
  filePath: string | null;
  filePaths: string[];
  status: 'running' | 'completed' | 'error';
};

export type SessionTimelineRow =
  | {
      id: string;
      kind: 'work';
      entries: SessionTimelineToolEntry[];
    }
  | {
      id: string;
      kind: 'message';
      message: CodexChatMessage;
      isStreaming: boolean;
    }
  | {
      id: string;
      kind: 'proposed-plan';
      message: CodexChatMessage;
      before: string | null;
      after: string | null;
      planMarkdown: string;
      isLatest: boolean;
    }
  | {
      id: string;
      kind: 'working';
    };

type MutableToolEntry = SessionTimelineToolEntry & {
  itemId: string | null;
};

function toEntryStatus(activity: CodexSessionActivity): SessionTimelineToolEntry['status'] {
  if (activity.tone === 'error') {
    return 'error';
  }

  return activity.phase === 'completed' ? 'completed' : 'running';
}

function mergeFilePaths(
  currentPaths: ReadonlyArray<string>,
  incomingPaths: ReadonlyArray<string>,
  incomingPath: string | null,
): string[] {
  const mergedPaths: string[] = [];
  const seenPaths = new Set<string>();

  for (const candidate of [...currentPaths, ...incomingPaths, incomingPath]) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const normalizedPath = candidate.trim();

    if (normalizedPath === '' || seenPaths.has(normalizedPath)) {
      continue;
    }

    seenPaths.add(normalizedPath);
    mergedPaths.push(normalizedPath);
  }

  return mergedPaths;
}

export function compactSessionActivities(
  activities: ReadonlyArray<CodexSessionActivity>,
): SessionTimelineToolEntry[] {
  const entries: MutableToolEntry[] = [];
  const indexByItemId = new Map<string, number>();

  for (const activity of activities) {
    const itemId = activity.itemId?.trim() ? activity.itemId : null;
    const nextStatus = toEntryStatus(activity);

    if (itemId) {
      const existingIndex = indexByItemId.get(itemId);

      if (existingIndex !== undefined) {
        const existingEntry = entries[existingIndex];

        if (existingEntry) {
          entries[existingIndex] = {
            ...existingEntry,
            label: activity.label || existingEntry.label,
            detail: activity.detail ?? existingEntry.detail,
            tone: activity.tone === 'error' ? 'error' : existingEntry.tone,
            itemType: activity.itemType ?? existingEntry.itemType,
            filePath: activity.filePath ?? existingEntry.filePath,
            filePaths: mergeFilePaths(
              existingEntry.filePaths,
              activity.filePaths ?? [],
              activity.filePath ?? null,
            ),
            status: nextStatus,
          };
          continue;
        }
      }
    }

    entries.push({
      id: activity.id,
      itemId,
      label: activity.label,
      detail: activity.detail ?? null,
      tone: activity.tone,
      itemType: activity.itemType ?? null,
      filePath: activity.filePath ?? null,
      filePaths: mergeFilePaths([], activity.filePaths ?? [], activity.filePath ?? null),
      status: nextStatus,
    });

    if (itemId) {
      indexByItemId.set(itemId, entries.length - 1);
    }
  }

  return entries.map((entry) => {
    const { itemId, ...timelineEntry } = entry;
    void itemId;
    return timelineEntry;
  });
}

export function deriveSessionTimelineRows(sessionState: CodexSessionState): SessionTimelineRow[] {
  const rows: SessionTimelineRow[] = [];
  const activeStreamingMessageId =
    sessionState.status === 'running'
      ? [...sessionState.currentTurnEntries]
          .reverse()
          .find(
            (entry) => entry.kind === 'message' && entry.message.role === 'assistant',
          )?.id ?? null
      : null;
  const appendTranscriptRows = (
    entries: ReadonlyArray<CodexTranscriptEntry>,
  ) => {
    for (const entry of entries) {
      if (entry.kind === 'work') {
        const toolEntries = compactSessionActivities(entry.activities);

        if (toolEntries.length > 0) {
          rows.push({
            id: entry.id,
            kind: 'work',
            entries: toolEntries,
          });
        }

        continue;
      }

      if (entry.message.role === 'assistant') {
        const proposedPlan = parseProposedPlanMessage(entry.message.text);

        if (proposedPlan) {
          rows.push({
            id: entry.id,
            kind: 'proposed-plan',
            message: entry.message,
            before: proposedPlan.before,
            after: proposedPlan.after,
            planMarkdown: proposedPlan.planMarkdown,
            isLatest: sessionState.latestProposedPlan?.messageId === entry.message.id,
          });
          continue;
        }
      }

      rows.push({
        id: entry.id,
        kind: 'message',
        message: entry.message,
        isStreaming:
          entry.message.role === 'assistant' && entry.id === activeStreamingMessageId,
      });
    }
  };

  appendTranscriptRows(sessionState.transcriptEntries);

  if (sessionState.currentTurnEntries.length > 0) {
    appendTranscriptRows(sessionState.currentTurnEntries);
  } else if (sessionState.status === 'running') {
    rows.push({
      id: 'current-turn:working',
      kind: 'working',
    });
  }

  return rows;
}

const USER_CHARS_PER_LINE_FALLBACK = 42;
const ASSISTANT_CHARS_PER_LINE_FALLBACK = 74;
const USER_BASE_HEIGHT_PX = 28;
const USER_LINE_HEIGHT_PX = 22;
const USER_ATTACHMENT_TILE_SIZE_PX = 64;
const USER_ATTACHMENT_ROW_GAP_PX = 8;
const ASSISTANT_BASE_HEIGHT_PX = 18;
const ASSISTANT_LINE_HEIGHT_PX = 28;
const ASSISTANT_IMAGE_HEIGHT_PX = 264;
const ASSISTANT_IMAGE_GAP_PX = 16;
const WORK_ENTRY_HEIGHT_PX = 18;
const WORK_GROUP_BASE_HEIGHT_PX = 12;
const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\([^)]+\)/g;

function estimateWrappedLineCount(text: string, charsPerLine: number): number {
  if (text.length === 0) {
    return 1;
  }

  let lines = 0;
  let currentLineLength = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      lines += Math.max(1, Math.ceil(currentLineLength / charsPerLine));
      currentLineLength = 0;
      continue;
    }

    currentLineLength += 1;
  }

  lines += Math.max(1, Math.ceil(currentLineLength / charsPerLine));
  return lines;
}

function estimateCharsPerLineForUser(viewportWidthPx: number | null): number {
  if (!viewportWidthPx || viewportWidthPx <= 0) {
    return USER_CHARS_PER_LINE_FALLBACK;
  }

  return Math.max(18, Math.floor((viewportWidthPx * 0.72) / 7.8));
}

function estimateCharsPerLineForAssistant(viewportWidthPx: number | null): number {
  if (!viewportWidthPx || viewportWidthPx <= 0) {
    return ASSISTANT_CHARS_PER_LINE_FALLBACK;
  }

  return Math.max(28, Math.floor((viewportWidthPx - 24) / 7.2));
}

function countMarkdownImages(text: string): number {
  return [...text.matchAll(MARKDOWN_IMAGE_PATTERN)].length;
}

function stripMarkdownImages(text: string): string {
  return text.replace(MARKDOWN_IMAGE_PATTERN, '').trim();
}

function estimateAttachmentHeight(attachmentCount: number, viewportWidthPx: number | null): number {
  if (attachmentCount <= 0) {
    return 0;
  }

  const availableWidthPx = viewportWidthPx ? viewportWidthPx * 0.72 : 320;
  const columns = Math.max(
    1,
    Math.floor((availableWidthPx + USER_ATTACHMENT_ROW_GAP_PX) / (USER_ATTACHMENT_TILE_SIZE_PX + USER_ATTACHMENT_ROW_GAP_PX)),
  );
  const rowCount = Math.ceil(attachmentCount / columns);

  return rowCount * USER_ATTACHMENT_TILE_SIZE_PX + (rowCount - 1) * USER_ATTACHMENT_ROW_GAP_PX;
}

export function estimateSessionTimelineRowHeight(
  row: SessionTimelineRow,
  viewportWidthPx: number | null,
): number {
  if (row.kind === 'work') {
    const MAX_COLLAPSED = 3;
    const visibleCount = Math.min(row.entries.length, MAX_COLLAPSED);
    const hasOverflow = row.entries.length > MAX_COLLAPSED;
    const overflowButtonHeight = hasOverflow ? 22 : 0;
    return WORK_GROUP_BASE_HEIGHT_PX + visibleCount * WORK_ENTRY_HEIGHT_PX + overflowButtonHeight;
  }

  if (row.kind === 'working') {
    return 42;
  }

  if (row.kind === 'proposed-plan') {
    const charsPerLine = estimateCharsPerLineForAssistant(viewportWidthPx);
    const preview = buildCollapsedProposedPlanPreviewMarkdown(row.planMarkdown, { maxLines: 6 });
    const previewLines = estimateWrappedLineCount(preview, charsPerLine);
    const beforeLines = row.before ? estimateWrappedLineCount(row.before, charsPerLine) : 0;
    const afterLines = row.after ? estimateWrappedLineCount(row.after, charsPerLine) : 0;

    return 184 + previewLines * 22 + (beforeLines + afterLines) * 24 + (row.isLatest ? 24 : 0);
  }

  if (row.message.role === 'user') {
    const charsPerLine = estimateCharsPerLineForUser(viewportWidthPx);
    const estimatedLines =
      row.message.text.trim().length > 0
        ? estimateWrappedLineCount(row.message.text, charsPerLine)
        : 0;
    const attachmentHeight = estimateAttachmentHeight(
      row.message.attachments.length,
      viewportWidthPx,
    );
    const attachmentGap = attachmentHeight > 0 && estimatedLines > 0 ? 12 : 0;

    return (
      USER_BASE_HEIGHT_PX +
      estimatedLines * USER_LINE_HEIGHT_PX +
      attachmentHeight +
      attachmentGap
    );
  }

  const charsPerLine = estimateCharsPerLineForAssistant(viewportWidthPx);
  const imageCount = countMarkdownImages(row.message.text);
  const textWithoutImages = stripMarkdownImages(row.message.text);
  const estimatedLines =
    textWithoutImages.length > 0
      ? estimateWrappedLineCount(textWithoutImages, charsPerLine)
      : 0;
  const imageHeight =
    imageCount > 0
      ? imageCount * ASSISTANT_IMAGE_HEIGHT_PX +
        (imageCount - 1) * ASSISTANT_IMAGE_GAP_PX
      : 0;
  const imageGap = estimatedLines > 0 && imageHeight > 0 ? 12 : 0;

  return (
    ASSISTANT_BASE_HEIGHT_PX +
    estimatedLines * ASSISTANT_LINE_HEIGHT_PX +
    imageHeight +
    imageGap
  );
}
