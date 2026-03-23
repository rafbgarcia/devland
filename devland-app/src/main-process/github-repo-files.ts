import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';

import { ghExecutable } from '@/main-process/gh-cli';

const execFileAsync = promisify(execFile);

const GitHubContentsFileSchema = z.object({
  path: z.string().min(1),
  html_url: z.string().url().nullable().optional(),
  encoding: z.string().min(1).optional(),
  content: z.string().optional(),
});

type GhApiExecutor = (endpoint: string) => Promise<string>;

type GitHubRepoTextFile = {
  path: string;
  text: string;
  htmlUrl: string | null;
};

type GithubRepoOverview = {
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  updatedAt: string;
  license: string | null;
  openIssues: number;
};

type RemoteRepoReadme = {
  path: string;
  markdown: string;
  htmlUrl: string | null;
};

const isNotFoundError = (error: unknown): boolean => {
  const candidate = error as NodeJS.ErrnoException & {
    stderr?: string;
    stdout?: string;
    message?: string;
  };
  const errorText = [candidate.stderr, candidate.stdout, candidate.message]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n');

  return /\b404\b/.test(errorText) || /not found/i.test(errorText);
};

const getDefaultGhApiExecutor = (): GhApiExecutor => {
  if (ghExecutable === null) {
    throw new Error('GitHub CLI is not available on this machine.');
  }

  const executable = ghExecutable;

  return async (endpoint: string) => {
    try {
      const { stdout } = await execFileAsync(
        executable,
        [
          'api',
          '--header',
          'Accept: application/vnd.github+json',
          endpoint,
        ],
        {
          env: {
            ...process.env,
            GH_PROMPT_DISABLED: '1',
          },
          timeout: 30_000,
          windowsHide: true,
        },
      );

      return stdout;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        throw new Error('GitHub CLI is not available on this machine.', { cause: error });
      }

      throw error;
    }
  };
};

const decodeGitHubFileContent = (
  response: z.infer<typeof GitHubContentsFileSchema>,
): string => {
  if (typeof response.content !== 'string' || response.content.length === 0) {
    throw new Error(`GitHub did not return file contents for ${response.path}.`);
  }

  if (response.encoding === undefined || response.encoding === 'utf-8') {
    return response.content;
  }

  if (response.encoding === 'base64') {
    return Buffer.from(response.content.replace(/\n/g, ''), 'base64').toString('utf8');
  }

  throw new Error(
    `Unsupported GitHub content encoding "${response.encoding}" for ${response.path}.`,
  );
};

const readGitHubContentsFile = async (
  slug: string,
  filePath: string,
  executeGhApi: GhApiExecutor,
): Promise<GitHubRepoTextFile | null> => {
  try {
    const responseText = await executeGhApi(`repos/${slug}/contents/${filePath}`);
    const response = GitHubContentsFileSchema.parse(JSON.parse(responseText));
    const text = decodeGitHubFileContent(response);

    return {
      path: response.path,
      text,
      htmlUrl: response.html_url ?? null,
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
};

export const readRemoteGitHubRepoFileText = async (
  slug: string,
  filePath: string,
  dependencies?: {
    executeGhApi?: GhApiExecutor;
  },
): Promise<string | null> => {
  const executeGhApi = dependencies?.executeGhApi ?? getDefaultGhApiExecutor();
  const file = await readGitHubContentsFile(slug, filePath, executeGhApi);

  return file === null ? null : file.text;
};

const GitHubRepoSchema = z.object({
  description: z.string().nullable().optional(),
  stargazers_count: z.number(),
  forks_count: z.number(),
  language: z.string().nullable().optional(),
  topics: z.array(z.string()).optional(),
  updated_at: z.string(),
  open_issues_count: z.number(),
  license: z
    .object({ spdx_id: z.string().nullable().optional() })
    .nullable()
    .optional(),
});

export const readGithubRepoOverview = async (
  slug: string,
  dependencies?: {
    executeGhApi?: GhApiExecutor;
  },
): Promise<GithubRepoOverview | null> => {
  const executeGhApi = dependencies?.executeGhApi ?? getDefaultGhApiExecutor();

  try {
    const responseText = await executeGhApi(`repos/${slug}`);
    const repo = GitHubRepoSchema.parse(JSON.parse(responseText));

    return {
      description: repo.description ?? null,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language ?? null,
      topics: repo.topics ?? [],
      updatedAt: repo.updated_at,
      license: repo.license?.spdx_id ?? null,
      openIssues: repo.open_issues_count,
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
};

export const readRemoteGitHubRepoReadme = async (
  slug: string,
  dependencies?: {
    executeGhApi?: GhApiExecutor;
  },
): Promise<RemoteRepoReadme | null> => {
  const executeGhApi = dependencies?.executeGhApi ?? getDefaultGhApiExecutor();

  try {
    const responseText = await executeGhApi(`repos/${slug}/readme`);
    const response = GitHubContentsFileSchema.parse(JSON.parse(responseText));

    return {
      path: response.path,
      markdown: decodeGitHubFileContent(response),
      htmlUrl: response.html_url ?? null,
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
};
