import { execFile } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  type CodexPathSearchInput,
  type CodexPathSearchResult,
  type CodexPathSearchResultItem,
} from '@/ipc/contracts';

const execFileAsync = promisify(execFile);

const INDEX_CACHE_TTL_MS = 15_000;
const INDEX_CACHE_MAX_KEYS = 16;
const INDEX_MAX_FILES = 25_000;
const READDIR_CONCURRENCY = 32;
const GIT_LIST_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  '.next',
  '.turbo',
  '.cache',
  'node_modules',
  'dist',
  'build',
  'out',
]);

type SearchableFileEntry = {
  relativePath: string;
  absolutePath: string;
  compactName: string;
  compactPath: string;
  normalizedPath: string;
  normalizedName: string;
};

type RepoFileIndex = {
  compactRepoLabel: string;
  compactRepoName: string;
  normalizedRepoLabel: string;
  repoPath: string;
  repoLabel: string;
  scannedAt: number;
  files: SearchableFileEntry[];
  truncated: boolean;
};

type RankedFileEntry = {
  item: CodexPathSearchResultItem;
  score: number;
};

const repoIndexCache = new Map<string, RepoFileIndex>();
const inFlightRepoIndexBuilds = new Map<string, Promise<RepoFileIndex>>();

const getGitExecOptions = () => ({
  timeout: 8_000,
  windowsHide: true,
  env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
});

function isAbsoluteProjectPath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}

function findLocalGithubRepoPath(slug: string): string | null {
  const segments = slug.trim().split('/').filter(Boolean);

  if (segments.length !== 2) {
    return null;
  }

  const targetPath = path.join(homedir(), 'github.com', segments[0]!, segments[1]!);
  return existsSync(path.join(targetPath, '.git')) ? targetPath : null;
}

function toPosixPath(input: string): string {
  return input.split(path.sep).join('/');
}

function basenameOf(input: string): string {
  const separatorIndex = input.lastIndexOf('/');
  return separatorIndex === -1 ? input : input.slice(separatorIndex + 1);
}

function isPathInsideIgnoredDirectory(relativePath: string): boolean {
  const firstSegment = relativePath.split('/')[0];
  return firstSegment ? IGNORED_DIRECTORY_NAMES.has(firstSegment) : false;
}

function normalizeQuery(input: string): string {
  return input.trim().replace(/^[/@.]+/, '').toLowerCase();
}

function normalizeCompact(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function scoreSubsequenceMatch(value: string, query: string): number | null {
  if (!query) {
    return 0;
  }

  let queryIndex = 0;
  let firstMatchIndex = -1;
  let previousMatchIndex = -1;
  let gapPenalty = 0;

  for (let valueIndex = 0; valueIndex < value.length; valueIndex += 1) {
    if (value[valueIndex] !== query[queryIndex]) {
      continue;
    }

    if (firstMatchIndex === -1) {
      firstMatchIndex = valueIndex;
    }
    if (previousMatchIndex !== -1) {
      gapPenalty += valueIndex - previousMatchIndex - 1;
    }

    previousMatchIndex = valueIndex;
    queryIndex += 1;

    if (queryIndex === query.length) {
      const spanPenalty = valueIndex - firstMatchIndex + 1 - query.length;
      const lengthPenalty = Math.min(64, value.length - query.length);
      return firstMatchIndex * 2 + gapPenalty * 3 + spanPenalty + lengthPenalty;
    }
  }

  return null;
}

function scoreEntry(entry: SearchableFileEntry, query: string): number | null {
  if (!query) {
    return 0;
  }

  if (entry.normalizedName === query) {
    return 0;
  }
  if (entry.normalizedPath === query) {
    return 1;
  }
  if (entry.normalizedName.startsWith(query)) {
    return 2;
  }
  if (entry.normalizedPath.startsWith(query)) {
    return 3;
  }
  if (entry.normalizedPath.includes(`/${query}`)) {
    return 4;
  }
  if (entry.normalizedName.includes(query)) {
    return 5;
  }
  if (entry.normalizedPath.includes(query)) {
    return 6;
  }

  const nameFuzzyScore = scoreSubsequenceMatch(entry.normalizedName, query);
  if (nameFuzzyScore !== null) {
    return 100 + nameFuzzyScore;
  }

  const pathFuzzyScore = scoreSubsequenceMatch(entry.normalizedPath, query);
  if (pathFuzzyScore !== null) {
    return 200 + pathFuzzyScore;
  }

  return null;
}

function scoreCompactMatch(value: string, query: string): number | null {
  if (!query) {
    return null;
  }

  const compactQuery = normalizeCompact(query);
  if (!compactQuery) {
    return null;
  }

  const compactValue = normalizeCompact(value);
  if (!compactValue) {
    return null;
  }

  if (compactValue === compactQuery) {
    return 7;
  }

  if (compactValue.startsWith(compactQuery)) {
    return 8;
  }

  if (compactValue.includes(compactQuery)) {
    return 12;
  }

  const fuzzyScore = scoreSubsequenceMatch(compactValue, compactQuery);
  if (fuzzyScore !== null) {
    return 220 + fuzzyScore;
  }

  return null;
}

function getLowerScore(current: number | null, candidate: number | null): number | null {
  if (candidate === null) {
    return current;
  }

  if (current === null) {
    return candidate;
  }

  return Math.min(current, candidate);
}

function scoreScopedEntry(entry: SearchableFileEntry, index: RepoFileIndex, query: string): number | null {
  let score = scoreEntry(entry, query);

  score = getLowerScore(score, scoreEntry({
    ...entry,
    normalizedName: `${index.normalizedRepoLabel}/${entry.normalizedName}`,
    normalizedPath: `${index.normalizedRepoLabel}/${entry.normalizedPath}`,
  }, query));
  score = getLowerScore(
    score,
    scoreCompactMatch(
      `${index.compactRepoName}${entry.compactName}`,
      query,
    ),
  );
  score = getLowerScore(
    score,
    scoreCompactMatch(
      `${index.compactRepoLabel}${entry.compactPath}`,
      query,
    ),
  );

  return score;
}

function compareRankedEntries(left: RankedFileEntry, right: RankedFileEntry): number {
  const scoreDelta = left.score - right.score;
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  return left.item.absolutePath.localeCompare(right.item.absolutePath);
}

function findInsertionIndex(entries: RankedFileEntry[], candidate: RankedFileEntry): number {
  let low = 0;
  let high = entries.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const current = entries[middle];

    if (!current) {
      break;
    }

    if (compareRankedEntries(candidate, current) < 0) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }

  return low;
}

function insertRankedEntry(
  entries: RankedFileEntry[],
  candidate: RankedFileEntry,
  limit: number,
): void {
  if (limit <= 0) {
    return;
  }

  const insertionIndex = findInsertionIndex(entries, candidate);
  if (entries.length < limit) {
    entries.splice(insertionIndex, 0, candidate);
    return;
  }

  if (insertionIndex >= limit) {
    return;
  }

  entries.splice(insertionIndex, 0, candidate);
  entries.pop();
}

function buildRepoLabel(repoPath: string): string {
  const githubRoot = path.join(homedir(), 'github.com');
  const relativeToGithubRoot = path.relative(githubRoot, repoPath);

  if (
    relativeToGithubRoot &&
    !relativeToGithubRoot.startsWith('..') &&
    !path.isAbsolute(relativeToGithubRoot)
  ) {
    return toPosixPath(relativeToGithubRoot);
  }

  return path.basename(repoPath) || repoPath;
}

function toSearchableFileEntry(repoPath: string, relativePath: string): SearchableFileEntry {
  const normalizedPath = relativePath.toLowerCase();
  const normalizedName = basenameOf(normalizedPath);

  return {
    relativePath,
    absolutePath: path.join(repoPath, relativePath),
    compactName: normalizeCompact(normalizedName),
    compactPath: normalizeCompact(relativePath),
    normalizedPath,
    normalizedName,
  };
}

function splitNullSeparatedPaths(input: string): string[] {
  return input
    .split('\0')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

async function mapWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  if (items.length === 0) {
    return [];
  }

  const boundedConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results = Array.from({ length: items.length }) as TOutput[];
  let nextIndex = 0;

  const workers = Array.from({ length: boundedConcurrency }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex] as TInput, currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

async function isValidLocalRepoRoot(repoPath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(repoPath);

    if (!stats.isDirectory()) {
      return false;
    }

    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'rev-parse', '--show-toplevel'],
      getGitExecOptions(),
    );

    const [resolvedInputPath, resolvedRepoRoot] = await Promise.all([
      fs.realpath(repoPath),
      fs.realpath(stdout.trim()),
    ]);

    return resolvedInputPath === resolvedRepoRoot;
  } catch {
    return false;
  }
}

async function resolveLocalRepoPath(repoReference: string): Promise<string | null> {
  const normalizedReference = repoReference.trim();

  if (!normalizedReference) {
    return null;
  }

  if (isAbsoluteProjectPath(normalizedReference)) {
    const resolvedPath = path.resolve(normalizedReference);
    return (await isValidLocalRepoRoot(resolvedPath)) ? resolvedPath : null;
  }

  const localRepoPath = findLocalGithubRepoPath(normalizedReference);
  if (!localRepoPath || !existsSync(localRepoPath)) {
    return null;
  }

  return path.resolve(localRepoPath);
}

async function buildIndexFromGit(repoPath: string): Promise<RepoFileIndex | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repoPath, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      {
        ...getGitExecOptions(),
        maxBuffer: GIT_LIST_MAX_BUFFER_BYTES,
      },
    );
    const listedPaths = [...new Set(
      splitNullSeparatedPaths(stdout)
        .map((entry) => toPosixPath(entry))
        .filter((entry) => entry.length > 0 && !isPathInsideIgnoredDirectory(entry)),
    )].sort((left, right) => left.localeCompare(right));

    const truncated = listedPaths.length > INDEX_MAX_FILES;
    const files = listedPaths
      .slice(0, INDEX_MAX_FILES)
      .map((relativePath) => toSearchableFileEntry(repoPath, relativePath));

    return {
      compactRepoLabel: normalizeCompact(buildRepoLabel(repoPath)),
      compactRepoName: normalizeCompact(basenameOf(buildRepoLabel(repoPath).toLowerCase())),
      normalizedRepoLabel: buildRepoLabel(repoPath).toLowerCase(),
      repoPath,
      repoLabel: buildRepoLabel(repoPath),
      scannedAt: Date.now(),
      files,
      truncated,
    };
  } catch {
    return null;
  }
}

async function buildIndexFromFilesystem(repoPath: string): Promise<RepoFileIndex> {
  let pendingDirectories: string[] = [''];
  const files: SearchableFileEntry[] = [];
  let truncated = false;

  while (pendingDirectories.length > 0 && !truncated) {
    const currentDirectories = pendingDirectories;
    pendingDirectories = [];

    const directoryEntries = await mapWithConcurrency(
      currentDirectories,
      READDIR_CONCURRENCY,
      async (relativeDir) => {
        const absoluteDir = relativeDir ? path.join(repoPath, relativeDir) : repoPath;

        try {
          const dirents = await fs.readdir(absoluteDir, { withFileTypes: true });
          return { relativeDir, dirents };
        } catch {
          return { relativeDir, dirents: null };
        }
      },
    );

    for (const directoryEntry of directoryEntries) {
      if (!directoryEntry.dirents) {
        continue;
      }

      const sortedDirents = [...directoryEntry.dirents].sort((left, right) =>
        left.name.localeCompare(right.name),
      );

      for (const dirent of sortedDirents) {
        const relativePath = toPosixPath(
          directoryEntry.relativeDir
            ? path.join(directoryEntry.relativeDir, dirent.name)
            : dirent.name,
        );

        if (!relativePath || isPathInsideIgnoredDirectory(relativePath)) {
          continue;
        }

        if (dirent.isDirectory()) {
          if (IGNORED_DIRECTORY_NAMES.has(dirent.name)) {
            continue;
          }

          pendingDirectories.push(relativePath);
          continue;
        }

        if (!dirent.isFile()) {
          continue;
        }

        files.push(toSearchableFileEntry(repoPath, relativePath));

        if (files.length >= INDEX_MAX_FILES) {
          truncated = true;
          break;
        }
      }

      if (truncated) {
        break;
      }
    }
  }

  return {
    compactRepoLabel: normalizeCompact(buildRepoLabel(repoPath)),
    compactRepoName: normalizeCompact(basenameOf(buildRepoLabel(repoPath).toLowerCase())),
    normalizedRepoLabel: buildRepoLabel(repoPath).toLowerCase(),
    repoPath,
    repoLabel: buildRepoLabel(repoPath),
    scannedAt: Date.now(),
    files,
    truncated,
  };
}

async function buildRepoFileIndex(repoPath: string): Promise<RepoFileIndex> {
  const gitIndex = await buildIndexFromGit(repoPath);

  if (gitIndex !== null) {
    return gitIndex;
  }

  return buildIndexFromFilesystem(repoPath);
}

async function getRepoFileIndex(repoPath: string): Promise<RepoFileIndex> {
  const cached = repoIndexCache.get(repoPath);
  if (cached && Date.now() - cached.scannedAt < INDEX_CACHE_TTL_MS) {
    return cached;
  }

  const inFlight = inFlightRepoIndexBuilds.get(repoPath);
  if (inFlight) {
    return inFlight;
  }

  const nextPromise = buildRepoFileIndex(repoPath)
    .then((index) => {
      repoIndexCache.set(repoPath, index);

      while (repoIndexCache.size > INDEX_CACHE_MAX_KEYS) {
        const oldestKey = repoIndexCache.keys().next().value;

        if (!oldestKey) {
          break;
        }

        repoIndexCache.delete(oldestKey);
      }

      return index;
    })
    .finally(() => {
      inFlightRepoIndexBuilds.delete(repoPath);
    });

  inFlightRepoIndexBuilds.set(repoPath, nextPromise);
  return nextPromise;
}

function toResultItem(
  entry: SearchableFileEntry,
  index: RepoFileIndex,
  scope: 'current' | 'global',
): CodexPathSearchResultItem {
  return {
    scope,
    repoPath: index.repoPath,
    repoLabel: index.repoLabel,
    relativePath: entry.relativePath,
    absolutePath: entry.absolutePath,
  };
}

export function clearCodexPathSearchCache(repoPath?: string): void {
  if (repoPath) {
    repoIndexCache.delete(path.resolve(repoPath));
    inFlightRepoIndexBuilds.delete(path.resolve(repoPath));
    return;
  }

  repoIndexCache.clear();
  inFlightRepoIndexBuilds.clear();
}

export async function searchCodexPaths(
  input: CodexPathSearchInput,
): Promise<CodexPathSearchResult> {
  const normalizedQuery = normalizeQuery(input.query);

  if (!normalizedQuery) {
    return {
      items: [],
      truncated: false,
    };
  }

  const limit = Math.max(1, Math.min(200, Math.floor(input.limit)));
  const currentRepoPath = path.resolve(input.cwd);
  const rankedEntries: RankedFileEntry[] = [];
  let matchedEntryCount = 0;
  let truncated = false;

  const resolvedRepoPaths =
    input.scope === 'current'
      ? [currentRepoPath]
      : (
          await Promise.all(
            input.storedRepoPaths.map((repoReference) => resolveLocalRepoPath(repoReference)),
          )
        )
          .filter((repoPath): repoPath is string => repoPath !== null)
          .filter((repoPath, index, values) => values.indexOf(repoPath) === index);

  for (const repoPath of resolvedRepoPaths) {
    const index = await getRepoFileIndex(repoPath);

    for (const file of index.files) {
      const score =
        input.scope === 'current'
          ? scoreEntry(file, normalizedQuery)
          : scoreScopedEntry(file, index, normalizedQuery);

      if (score === null) {
        continue;
      }

      matchedEntryCount += 1;
      insertRankedEntry(
        rankedEntries,
        {
          item: toResultItem(file, index, input.scope),
          score,
        },
        limit,
      );
    }

    truncated ||= index.truncated;
  }

  return {
    items: rankedEntries.map((entry) => entry.item),
    truncated: truncated || matchedEntryCount > limit,
  };
}
