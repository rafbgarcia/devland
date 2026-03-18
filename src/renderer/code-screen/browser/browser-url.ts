const LOCAL_HOST_SEGMENTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);
const HAS_URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;

const getCandidateHost = (value: string): string => {
  const [authority] = value.split(/[/?#]/, 1);
  const host = authority?.replace(/:\d+$/, '') ?? '';

  return host.toLowerCase();
};

const isLocalCandidate = (value: string): boolean => {
  const host = getCandidateHost(value);

  return LOCAL_HOST_SEGMENTS.has(host) || host.endsWith('.local');
};

export const normalizeBrowserUrlInput = (value: string): string | null => {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed === 'about:blank') {
    return trimmed;
  }

  const candidate = HAS_URL_SCHEME_PATTERN.test(trimmed)
    ? trimmed
    : `${isLocalCandidate(trimmed) ? 'http' : 'https'}://${trimmed}`;

  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
};
