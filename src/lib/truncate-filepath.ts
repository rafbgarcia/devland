const ELLIPSIS = '…';

function getLastPathSeparatorIndex(path: string) {
  return Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
}

export function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 0) {
    return '';
  }

  if (maxLength === 1) {
    return ELLIPSIS;
  }

  const midpoint = (maxLength - 1) / 2;
  const prefix = value.slice(0, Math.floor(midpoint));
  const suffix = value.slice(value.length - Math.ceil(midpoint));

  return `${prefix}${ELLIPSIS}${suffix}`;
}

export function truncateFilePath(path: string, maxLength: number) {
  if (path.length <= maxLength) {
    return path;
  }

  if (maxLength <= 0) {
    return '';
  }

  if (maxLength === 1) {
    return ELLIPSIS;
  }

  const lastSeparatorIndex = getLastPathSeparatorIndex(path);
  if (lastSeparatorIndex === -1) {
    return truncateMiddle(path, maxLength);
  }

  const fileNameLength = path.length - lastSeparatorIndex - 1;
  if (fileNameLength + 2 > maxLength) {
    return truncateMiddle(path, maxLength);
  }

  const prefix = path.slice(0, maxLength - fileNameLength - 2);
  const suffix = path.slice(lastSeparatorIndex);

  return `${prefix}${ELLIPSIS}${suffix}`;
}

export function splitFilePath(path: string) {
  const trimmedPath =
    path.length > 1 && /[\\/]$/.test(path) ? path.slice(0, -1) : path;
  const lastSeparatorIndex = getLastPathSeparatorIndex(trimmedPath);

  if (lastSeparatorIndex === -1) {
    return {
      directory: '',
      fileName: trimmedPath,
    };
  }

  return {
    directory: trimmedPath.slice(0, lastSeparatorIndex + 1),
    fileName: trimmedPath.slice(lastSeparatorIndex + 1),
  };
}

export function getTruncatedFilePathParts(path: string, maxLength: number) {
  const truncatedPath = truncateFilePath(path, maxLength);
  const { directory, fileName } = splitFilePath(truncatedPath);

  return {
    directory,
    fileName,
    isTruncated: truncatedPath !== path,
    path: truncatedPath,
  };
}
