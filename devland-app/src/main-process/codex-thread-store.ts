import { createRequire } from 'node:module';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { CodexChatImageAttachment } from '@/lib/codex-chat';
import type { CodexResumedThread } from '@/ipc/contracts';
import type { App } from 'electron';

const THREAD_STORE_ROOT_DIRNAME = 'codex-threads';

type StoredCodexUserMessage = {
  turnId: string | null;
  itemId: string | null;
  text: string;
  attachments: CodexChatImageAttachment[];
  createdAt: string;
};

type StoredCodexThread = {
  threadId: string;
  userMessages: StoredCodexUserMessage[];
  updatedAt: string;
};

const sanitizeFileSegment = (value: string): string =>
  value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'thread';

const require = createRequire(__filename);

function getElectronApp(): App | null {
  try {
    const electronModule = require('electron') as { app?: App };
    return electronModule.app ?? null;
  } catch {
    return null;
  }
}

const getThreadStoreRoot = (): string =>
  path.join(
    process.env.DEVLAND_USER_DATA_DIR?.trim() ||
      process.env.DEVLAND_TEST_USER_DATA_DIR?.trim() ||
      getElectronApp()?.getPath('userData') ||
      path.join(process.cwd(), '.devland-user-data'),
    THREAD_STORE_ROOT_DIRNAME,
  );

const getThreadStoreFilePath = (threadId: string): string =>
  path.join(getThreadStoreRoot(), `${sanitizeFileSegment(threadId)}.json`);

function sanitizeStoredAttachment(attachment: CodexChatImageAttachment): CodexChatImageAttachment {
  return {
    ...attachment,
    previewUrl:
      attachment.previewUrl?.startsWith('data:') || attachment.previewUrl?.startsWith('blob:')
        ? null
        : attachment.previewUrl,
  };
}

async function readStoredThread(threadId: string): Promise<StoredCodexThread | null> {
  const filePath = getThreadStoreFilePath(threadId);

  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as StoredCodexThread;

    if (!parsed || parsed.threadId !== threadId || !Array.isArray(parsed.userMessages)) {
      return null;
    }

    return {
      threadId,
      userMessages: parsed.userMessages.map((message) => ({
        turnId: typeof message.turnId === 'string' && message.turnId.trim() ? message.turnId : null,
        itemId: typeof message.itemId === 'string' && message.itemId.trim() ? message.itemId : null,
        text: typeof message.text === 'string' ? message.text : '',
        attachments: Array.isArray(message.attachments)
          ? message.attachments.map((attachment) => sanitizeStoredAttachment({
              type: 'image',
              name: typeof attachment?.name === 'string' ? attachment.name : 'Attached image',
              mimeType: typeof attachment?.mimeType === 'string' ? attachment.mimeType : '',
              sizeBytes: typeof attachment?.sizeBytes === 'number' ? attachment.sizeBytes : 0,
              previewUrl:
                typeof attachment?.previewUrl === 'string' ? attachment.previewUrl : null,
            }))
          : [],
        createdAt:
          typeof message.createdAt === 'string' && message.createdAt.trim()
            ? message.createdAt
            : new Date(0).toISOString(),
      })),
      updatedAt:
        typeof parsed.updatedAt === 'string' && parsed.updatedAt.trim()
          ? parsed.updatedAt
          : new Date(0).toISOString(),
    };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function writeStoredThread(thread: StoredCodexThread): Promise<void> {
  const root = getThreadStoreRoot();
  const filePath = getThreadStoreFilePath(thread.threadId);
  const tempPath = `${filePath}.tmp`;

  await mkdir(root, { recursive: true });
  await writeFile(tempPath, JSON.stringify(thread, null, 2), 'utf8');
  await rename(tempPath, filePath);
}

function normalizeComparableText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function findStoredUserMessageIndex(
  messages: StoredCodexUserMessage[],
  input: { turnId: string | null; itemId: string | null; text: string },
  matchedIndexes: Set<number>,
): number {
  if (input.itemId) {
    const byItemId = messages.findIndex((message) => message.itemId === input.itemId);
    if (byItemId !== -1) {
      return byItemId;
    }
  }

  if (input.turnId) {
    const byTurnId = messages.findIndex((message) => message.turnId === input.turnId);
    if (byTurnId !== -1) {
      return byTurnId;
    }
  }

  const normalizedText = normalizeComparableText(input.text);

  if (normalizedText.length > 0) {
    const byText = messages.findIndex(
      (message, index) =>
        !matchedIndexes.has(index) &&
        normalizeComparableText(message.text) === normalizedText,
    );

    if (byText !== -1) {
      return byText;
    }
  }

  return messages.findIndex((_message, index) => !matchedIndexes.has(index));
}

export async function recordCodexThreadUserMessage(input: {
  threadId: string;
  turnId: string | null;
  prompt: string;
  attachments: readonly CodexChatImageAttachment[];
}): Promise<void> {
  const existing: StoredCodexThread =
    (await readStoredThread(input.threadId)) ?? {
      threadId: input.threadId,
      userMessages: [],
      updatedAt: new Date(0).toISOString(),
    };
  const nextMessage: StoredCodexUserMessage = {
    turnId: input.turnId,
    itemId: null,
    text: input.prompt,
    attachments: input.attachments.map(sanitizeStoredAttachment),
    createdAt: new Date().toISOString(),
  };
  const existingIndex =
    input.turnId === null
      ? -1
      : existing.userMessages.findIndex((message) => message.turnId === input.turnId);

  if (existingIndex === -1) {
    existing.userMessages.push(nextMessage);
  } else {
    const currentMessage = existing.userMessages[existingIndex];

    existing.userMessages[existingIndex] = currentMessage
      ? {
          ...currentMessage,
          text: input.prompt,
          attachments: input.attachments.map(sanitizeStoredAttachment),
        }
      : nextMessage;
  }

  existing.updatedAt = new Date().toISOString();
  await writeStoredThread(existing);
}

export async function hydrateCodexThreadFromStore(
  thread: CodexResumedThread,
): Promise<CodexResumedThread> {
  const storedThread = await readStoredThread(thread.threadId);

  if (!storedThread) {
    return thread;
  }

  let didUpdateStoredThread = false;
  const matchedIndexes = new Set<number>();
  const messages = thread.messages.map((message) => {
    if (message.role !== 'user') {
      return message;
    }

    const storedIndex = findStoredUserMessageIndex(
      storedThread.userMessages,
      {
        turnId: message.turnId,
        itemId: message.itemId,
        text: message.text,
      },
      matchedIndexes,
    );

    if (storedIndex === -1) {
      return message;
    }

    matchedIndexes.add(storedIndex);
    const storedMessage = storedThread.userMessages[storedIndex];

    if (!storedMessage) {
      return message;
    }

    if (message.itemId && storedMessage.itemId !== message.itemId) {
      storedThread.userMessages[storedIndex] = {
        ...storedMessage,
        itemId: message.itemId,
      };
      didUpdateStoredThread = true;
    }

    return {
      ...message,
      attachments:
        storedMessage.attachments.length > 0
          ? storedMessage.attachments
          : message.attachments,
    };
  });

  if (didUpdateStoredThread) {
    storedThread.updatedAt = new Date().toISOString();
    await writeStoredThread(storedThread);
  }

  return {
    ...thread,
    messages,
  };
}
