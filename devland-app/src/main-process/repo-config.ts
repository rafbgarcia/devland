import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { RepoConfigSchema, type RepoConfig } from '@/extensions/contracts';
import { isGitHubRepoReference } from '@/main-process/git';
import { readRemoteGitHubRepoFileText } from '@/main-process/github-repo-files';

export const DEVLAND_CONFIG_FILE = 'devland.json';

const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const raw = await readFile(filePath, 'utf8');

  return JSON.parse(raw) as T;
};

export const readRepoConfig = async (
  repoPath: string,
  dependencies?: {
    readRemoteFileText?: (slug: string, filePath: string) => Promise<string | null>;
  },
): Promise<RepoConfig> => {
  if (isGitHubRepoReference(repoPath)) {
    const readRemoteFileText =
      dependencies?.readRemoteFileText ?? readRemoteGitHubRepoFileText;
    const remoteConfigText = await readRemoteFileText(repoPath, DEVLAND_CONFIG_FILE);

    if (remoteConfigText === null) {
      return RepoConfigSchema.parse({});
    }

    let configValue: unknown;

    try {
      configValue = JSON.parse(remoteConfigText);
    } catch (error) {
      throw new Error(
        `Could not parse ${DEVLAND_CONFIG_FILE} from ${repoPath}.`,
        { cause: error },
      );
    }

    return RepoConfigSchema.parse(
      typeof configValue === 'object' && configValue !== null ? configValue : {},
    );
  }

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
