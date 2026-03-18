const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

const normalizePartitionSegment = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.length > 0 ? normalized.slice(0, 32) : 'target';
};

export const createBrowserPartition = (targetId: string): string =>
  `persist:devland-browser:${normalizePartitionSegment(targetId)}:${Buffer.from(targetId).toString('base64url').slice(0, 16)}`;

const normalizeHostName = (hostname: string): string =>
  hostname.trim().replace(/^\[|\]$/g, '').toLowerCase();

export const isLoopbackHost = (hostname: string): boolean => {
  const normalized = normalizeHostName(hostname);

  return (
    LOOPBACK_HOSTS.has(normalized) ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local')
  );
};

export const isAllowedBrowserUrl = (urlString: string): boolean => {
  if (urlString === 'about:blank') {
    return true;
  }

  try {
    const url = new URL(urlString);

    if (url.protocol === 'https:') {
      return true;
    }

    return url.protocol === 'http:' && isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
};

export const isSafeExternalUrl = (urlString: string): boolean => {
  try {
    const url = new URL(urlString);

    return url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
};
