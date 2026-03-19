import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { RepoConfigSchema, type RepoConfig } from '@/extensions/contracts';

export const DEVLAND_CONFIG_FILE = 'devland.json';

const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const raw = await readFile(filePath, 'utf8');

  return JSON.parse(raw) as T;
};

export const readRepoConfig = async (repoPath: string): Promise<RepoConfig> => {
  const configPath = path.join(repoPath, DEVLAND_CONFIG_FILE);

  let configValue: unknown;

  try {
    configValue = await readJsonFile<unknown>(configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return RepoConfigSchema.parse({});
    }

    throw error;
  }

  return RepoConfigSchema.parse(
    typeof configValue === 'object' && configValue !== null ? configValue : {},
  );
};
