import { createRequire } from 'node:module';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { App } from 'electron';

const CHECKPOINT_STORE_FILENAME = 'codex-prompt-request-checkpoints.json';

type StoredCheckpointStore = {
  checkpoints: Record<string, number>;
};

const require = createRequire(__filename);

function getElectronApp(): App | null {
  try {
    const electronModule = require('electron') as { app?: App };
    return electronModule.app ?? null;
  } catch {
    return null;
  }
}

function getStoreRoot(): string {
  return (
    process.env.DEVLAND_USER_DATA_DIR?.trim() ||
    process.env.DEVLAND_TEST_USER_DATA_DIR?.trim() ||
    getElectronApp()?.getPath('userData') ||
    path.join(process.cwd(), '.devland-user-data')
  );
}

function getStoreFilePath(): string {
  return path.join(getStoreRoot(), CHECKPOINT_STORE_FILENAME);
}

function toCheckpointKey(repoPath: string, threadId: string): string {
  return `${repoPath}\0${threadId}`;
}

async function readStore(): Promise<StoredCheckpointStore> {
  const filePath = getStoreFilePath();

  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as StoredCheckpointStore;

    if (!parsed || typeof parsed !== 'object' || typeof parsed.checkpoints !== 'object') {
      return { checkpoints: {} };
    }

    return {
      checkpoints: Object.fromEntries(
        Object.entries(parsed.checkpoints).flatMap(([key, value]) =>
          typeof value === 'number' && Number.isInteger(value) && value >= 0
            ? [[key, value]]
            : [],
        ),
      ),
    };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { checkpoints: {} };
    }

    throw error;
  }
}

async function writeStore(store: StoredCheckpointStore): Promise<void> {
  const root = getStoreRoot();
  const filePath = getStoreFilePath();
  const tempPath = `${filePath}.tmp`;

  await mkdir(root, { recursive: true });
  await writeFile(tempPath, JSON.stringify(store, null, 2), 'utf8');
  await rename(tempPath, filePath);
}

export async function getCodexPromptRequestCheckpoint(input: {
  repoPath: string;
  threadId: string;
}): Promise<number> {
  const store = await readStore();
  return store.checkpoints[toCheckpointKey(input.repoPath, input.threadId)] ?? 0;
}

export async function recordCodexPromptRequestCheckpoint(input: {
  repoPath: string;
  threadId: string;
  transcriptEntryCount: number;
}): Promise<void> {
  const store = await readStore();
  store.checkpoints[toCheckpointKey(input.repoPath, input.threadId)] = input.transcriptEntryCount;
  await writeStore(store);
}
