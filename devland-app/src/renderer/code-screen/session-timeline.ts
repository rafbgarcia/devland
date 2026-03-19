import type {
  CodexChatMessage,
  CodexSessionActivity,
  CodexSessionState,
  CodexTranscriptEntry,
} from '@/renderer/code-screen/codex-session-state';

export type SessionTimelineToolEntry = {
  id: string;
  label: string;
  detail: string | null;
  tone: 'info' | 'tool' | 'error';
  itemType: string | null;
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

  if (sessionState.status === 'running') {
    if (sessionState.currentTurnEntries.length > 0) {
      appendTranscriptRows(sessionState.currentTurnEntries);
    } else {
      rows.push({
        id: 'current-turn:working',
        kind: 'working',
      });
    }
  }

  return rows;
}

const USER_CHARS_PER_LINE_FALLBACK = 42;
const ASSISTANT_CHARS_PER_LINE_FALLBACK = 74;
const USER_BASE_HEIGHT_PX = 88;
const ASSISTANT_BASE_HEIGHT_PX = 56;
const WORK_ENTRY_HEIGHT_PX = 34;
const WORK_GROUP_BASE_HEIGHT_PX = 52;

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

  if (row.message.role === 'user') {
    const charsPerLine = estimateCharsPerLineForUser(viewportWidthPx);
    const estimatedLines = estimateWrappedLineCount(row.message.text, charsPerLine);
    return USER_BASE_HEIGHT_PX + estimatedLines * 22;
  }

  const charsPerLine = estimateCharsPerLineForAssistant(viewportWidthPx);
  const estimatedLines = estimateWrappedLineCount(row.message.text, charsPerLine);
  return ASSISTANT_BASE_HEIGHT_PX + estimatedLines * 24;
}
