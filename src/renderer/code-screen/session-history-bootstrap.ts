import { summarizeCodexUserMessage, type CodexChatImageAttachment } from '@/lib/codex-chat';
import type { CodexChatMessage } from '@/renderer/code-screen/codex-session-state';

const BOOTSTRAP_PREAMBLE =
  'Continue this conversation using the transcript context below. The final section is the latest user request to answer now.';
const TRANSCRIPT_HEADER = 'Transcript context:';
const LATEST_PROMPT_HEADER = 'Latest user request (answer this now):';
const OMITTED_SUMMARY = (count: number) =>
  `[${count} earlier message(s) omitted to stay within input limits.]`;

function messageRoleLabel(message: CodexChatMessage): 'USER' | 'ASSISTANT' {
  return message.role === 'assistant' ? 'ASSISTANT' : 'USER';
}

function buildMessageBlock(message: CodexChatMessage): string {
  return `${messageRoleLabel(message)}:\n${summarizeCodexUserMessage({
    text: message.text,
    attachments: message.attachments,
  })}`;
}

function finalizeWithPrompt(
  transcriptBody: string,
  latestPrompt: string,
  maxChars: number,
): string | null {
  const text = `${BOOTSTRAP_PREAMBLE}\n\n${TRANSCRIPT_HEADER}\n${transcriptBody}\n\n${LATEST_PROMPT_HEADER}\n${latestPrompt}`;

  return text.length <= maxChars ? text : null;
}

export function buildSessionHistoryBootstrap(
  previousMessages: CodexChatMessage[],
  latestMessage: {
    text: string;
    attachments: readonly CodexChatImageAttachment[];
  },
  maxChars: number,
): string | null {
  if (previousMessages.length === 0) {
    return null;
  }

  const latestPrompt = summarizeCodexUserMessage(latestMessage);

  const budget = Number.isFinite(maxChars) ? Math.max(1, Math.floor(maxChars)) : 1;
  const newestFirstBlocks = previousMessages.toReversed().map(buildMessageBlock);
  let includedNewestFirst: string[] = [];

  for (const block of newestFirstBlocks) {
    const nextNewestFirst = [...includedNewestFirst, block];
    const nextChronological = nextNewestFirst.toReversed();
    const omittedCount = newestFirstBlocks.length - nextChronological.length;
    const transcriptBody =
      omittedCount > 0
        ? `${OMITTED_SUMMARY(omittedCount)}\n\n${nextChronological.join('\n\n')}`
        : nextChronological.join('\n\n');

    if (!finalizeWithPrompt(transcriptBody, latestPrompt, budget)) {
      break;
    }

    includedNewestFirst = nextNewestFirst;
  }

  if (includedNewestFirst.length === 0) {
    return null;
  }

  const includedChronological = includedNewestFirst.toReversed();
  const omittedCount = newestFirstBlocks.length - includedChronological.length;
  const transcriptBody =
    omittedCount > 0
      ? `${OMITTED_SUMMARY(omittedCount)}\n\n${includedChronological.join('\n\n')}`
      : includedChronological.join('\n\n');

  return finalizeWithPrompt(transcriptBody, latestPrompt, budget);
}
