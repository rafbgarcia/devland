import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, afterEach } from 'node:test';

import {
  hydrateCodexThreadFromStore,
  recordCodexThreadUserMessage,
} from '@/main-process/codex-thread-store';

const temporaryDirectories = new Set<string>();

function makeTempUserDataDir(): string {
  const directoryPath = mkdtempSync(path.join(tmpdir(), 'devland-codex-thread-store-'));
  temporaryDirectories.add(directoryPath);
  return directoryPath;
}

afterEach(() => {
  delete process.env.DEVLAND_TEST_USER_DATA_DIR;

  for (const directoryPath of temporaryDirectories) {
    rmSync(directoryPath, { recursive: true, force: true });
  }

  temporaryDirectories.clear();
});

describe('hydrateCodexThreadFromStore', () => {
  it('rehydrates stored attachment previews onto resumed user messages by turn id', async () => {
    const userDataDir = makeTempUserDataDir();
    process.env.DEVLAND_TEST_USER_DATA_DIR = userDataDir;

    await recordCodexThreadUserMessage({
      threadId: 'thread-1',
      turnId: 'turn-1',
      prompt: 'What is wrong here?',
      attachments: [
        {
          type: 'image',
          name: 'screenshot.png',
          mimeType: 'image/png',
          sizeBytes: 128,
          previewUrl: 'devland-codex-attachment://asset/ab/cd.png',
        },
      ],
    });

    const hydrated = await hydrateCodexThreadFromStore({
      threadId: 'thread-1',
      messages: [
        {
          id: 'user-1',
          role: 'user',
          text: 'What is wrong here?',
          attachments: [
            {
              type: 'image',
              name: 'Attached image',
              mimeType: '',
              sizeBytes: 0,
              previewUrl: null,
            },
          ],
          createdAt: '2026-03-22T12:00:00.000Z',
          completedAt: '2026-03-22T12:00:00.000Z',
          turnId: 'turn-1',
          itemId: 'user-1',
        },
      ],
    });

    assert.deepEqual(hydrated.messages[0]?.attachments, [
      {
        type: 'image',
        name: 'screenshot.png',
        mimeType: 'image/png',
        sizeBytes: 128,
        previewUrl: 'devland-codex-attachment://asset/ab/cd.png',
      },
    ]);

    const storedThread = JSON.parse(
      readFileSync(path.join(userDataDir, 'codex-threads', 'thread-1.json'), 'utf8'),
    ) as {
      userMessages: Array<{ itemId: string | null }>;
    };

    assert.equal(storedThread.userMessages[0]?.itemId, 'user-1');
  });
});
