export function getFromLruCache<T>(cache: Map<string, T>, key: string) {
  const cached = cache.get(key);

  if (cached === undefined) {
    return undefined;
  }

  cache.delete(key);
  cache.set(key, cached);

  return cached;
}

export function setLruCacheValue<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit: number,
) {
  if (cache.has(key)) {
    cache.delete(key);
  }

  cache.set(key, value);

  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;

    if (oldestKey === undefined) {
      break;
    }

    cache.delete(oldestKey);
  }
}
