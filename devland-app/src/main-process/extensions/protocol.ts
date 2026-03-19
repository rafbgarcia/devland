import path from 'node:path';

export const DEVLAND_EXTENSION_PROTOCOL = 'devland-extension';

const extensionRootByKey = new Map<string, string>();
const extensionKeyByRoot = new Map<string, string>();

const sanitizeSegment = (value: string): string =>
  value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'extension';

const normalizeRootPath = (rootPath: string): string => path.resolve(rootPath);

const ensureExtensionRootKey = (rootPath: string): string => {
  const normalizedRootPath = normalizeRootPath(rootPath);
  const existingKey = extensionKeyByRoot.get(normalizedRootPath);

  if (existingKey !== undefined) {
    return existingKey;
  }

  const baseKey = sanitizeSegment(path.basename(normalizedRootPath));
  let nextKey = baseKey;
  let counter = 1;

  while (extensionRootByKey.has(nextKey)) {
    nextKey = `${baseKey}-${counter++}`;
  }

  extensionRootByKey.set(nextKey, normalizedRootPath);
  extensionKeyByRoot.set(normalizedRootPath, nextKey);

  return nextKey;
};

const encodeRelativePath = (relativePath: string): string =>
  relativePath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const decodeRelativePath = (pathname: string): string =>
  pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
    .join(path.sep);

export const getExtensionEntryUrl = (rootPath: string, relativePath: string): string => {
  const rootKey = ensureExtensionRootKey(rootPath);
  const normalizedRelativePath = relativePath.trim().replace(/^[/\\]+/, '');

  return `${DEVLAND_EXTENSION_PROTOCOL}://${rootKey}/${encodeRelativePath(normalizedRelativePath)}`;
};

export const resolveExtensionAssetPath = (requestUrl: string): string | null => {
  const parsedUrl = new URL(requestUrl);

  if (parsedUrl.protocol !== `${DEVLAND_EXTENSION_PROTOCOL}:`) {
    return null;
  }

  const rootPath = extensionRootByKey.get(parsedUrl.host);

  if (rootPath === undefined) {
    return null;
  }

  const relativePath = decodeRelativePath(parsedUrl.pathname);
  const absolutePath = path.resolve(rootPath, relativePath);
  const normalizedRootPath = normalizeRootPath(rootPath);

  if (
    absolutePath !== normalizedRootPath &&
    !absolutePath.startsWith(`${normalizedRootPath}${path.sep}`)
  ) {
    return null;
  }

  return absolutePath;
};
