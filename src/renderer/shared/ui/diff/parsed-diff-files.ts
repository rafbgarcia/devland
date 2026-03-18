import { parseUnifiedDiffDocument, type DiffFile } from '@/lib/diff';
import { getFromLruCache, setLruCacheValue } from '@/renderer/shared/lib/lru';

const PARSED_DIFF_CACHE_LIMIT = 12;

const parsedDiffCache = new Map<string, DiffFile[]>();

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function getParsedDiffCacheKey(rawDiff: string) {
  return `${rawDiff.length}:${hashString(rawDiff)}`;
}

export function getParsedDiffFiles(rawDiff: string): DiffFile[] {
  const cacheKey = getParsedDiffCacheKey(rawDiff);
  const cached = getFromLruCache(parsedDiffCache, cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const parsedFiles = parseUnifiedDiffDocument(rawDiff).files;
  setLruCacheValue(parsedDiffCache, cacheKey, parsedFiles, PARSED_DIFF_CACHE_LIMIT);
  return parsedFiles;
}
