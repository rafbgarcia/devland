import type {
  CodexPromptRequestTranscriptEntry,
  GitPromptRequestSnapshot,
} from '@/ipc/contracts';
import type { CodexComposerSettings } from '@/lib/codex-chat';
import type {
  CodexSessionActivity,
  CodexSessionState,
  CodexTranscriptEntry,
} from '@/renderer/code-screen/codex-session-state';

function sanitizeActivity(activity: CodexSessionActivity): CodexSessionActivity {
  return {
    ...activity,
    filePaths: activity.filePaths ?? [],
  };
}

function sanitizeTranscriptEntry(entry: CodexTranscriptEntry): CodexPromptRequestTranscriptEntry {
  if (entry.kind === 'work') {
    return {
      id: entry.id,
      kind: 'work',
      activities: entry.activities.map(sanitizeActivity),
    };
  }

  return {
    id: entry.id,
    kind: 'message',
    message: {
      id: entry.message.id,
      role: entry.message.role,
      text: entry.message.text,
      attachments: entry.message.attachments.map((attachment) => ({
        ...attachment,
        previewUrl: null,
      })),
      createdAt: entry.message.createdAt,
      completedAt: entry.message.completedAt,
      turnId: entry.message.turnId,
      itemId: entry.message.itemId,
    },
  };
}

export function buildGitPromptRequestSnapshot(input: {
  sessionState: Pick<CodexSessionState, 'threadId' | 'transcriptEntries'>;
  settings: Pick<CodexComposerSettings, 'model' | 'reasoningEffort'>;
  branchName: string;
  checkpoint: number;
}): GitPromptRequestSnapshot | null {
  if (!input.sessionState.threadId) {
    return null;
  }

  const transcriptEntryEnd = input.sessionState.transcriptEntries.length;
  const transcriptEntryStart = Math.min(input.checkpoint, transcriptEntryEnd);

  return {
    version: 1,
    threadId: input.sessionState.threadId,
    branchName: input.branchName,
    createdAt: new Date().toISOString(),
    settings: {
      model: input.settings.model,
      reasoningEffort: input.settings.reasoningEffort,
    },
    checkpoint: {
      transcriptEntryStart,
      transcriptEntryEnd,
    },
    transcriptEntries: input.sessionState.transcriptEntries
      .slice(transcriptEntryStart)
      .map(sanitizeTranscriptEntry),
  };
}
