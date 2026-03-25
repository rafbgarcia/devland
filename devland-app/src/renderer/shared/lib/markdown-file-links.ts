export type ParsedMarkdownFileLink = {
  absoluteFilePath: string;
  relativeFilePath: string;
  lineNumber: number | null;
  columnNumber: number | null;
};

const HASH_LINE_REFERENCE_PATTERN =
  /^(?:L)?(?<line>\d+)(?:C(?<column>\d+)|:(?<columnWithColon>\d+))?(?:-L?\d+)?$/i;
const PATH_LINE_REFERENCE_PATTERN =
  /^(?<filePath>.+?):(?<line>\d+)(?::(?<column>\d+))?$/;

function decodeHrefSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeFilePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/\/+$/, '');
}

function parseHashReference(fragment: string): {
  lineNumber: number | null;
  columnNumber: number | null;
} {
  const match = HASH_LINE_REFERENCE_PATTERN.exec(fragment);

  if (!match?.groups) {
    return {
      lineNumber: null,
      columnNumber: null,
    };
  }

  return {
    lineNumber: Number.parseInt(match.groups.line ?? '', 10),
    columnNumber: match.groups.column
      ? Number.parseInt(match.groups.column, 10)
      : match.groups.columnWithColon
        ? Number.parseInt(match.groups.columnWithColon, 10)
        : null,
  };
}

function parseFilePathReference(pathname: string): {
  filePath: string;
  lineNumber: number | null;
  columnNumber: number | null;
} {
  const match = PATH_LINE_REFERENCE_PATTERN.exec(pathname);

  if (!match?.groups) {
    return {
      filePath: pathname,
      lineNumber: null,
      columnNumber: null,
    };
  }

  return {
    filePath: match.groups.filePath ?? pathname,
    lineNumber: Number.parseInt(match.groups.line ?? '', 10),
    columnNumber: match.groups.column
      ? Number.parseInt(match.groups.column, 10)
      : null,
  };
}

function splitHref(value: string): {
  pathname: string;
  fragment: string | null;
} {
  const hashIndex = value.indexOf('#');

  if (hashIndex === -1) {
    return {
      pathname: value,
      fragment: null,
    };
  }

  return {
    pathname: value.slice(0, hashIndex),
    fragment: value.slice(hashIndex + 1),
  };
}

function parseAbsoluteFilePath(href: string): {
  absoluteFilePath: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
} {
  if (href.startsWith('file://')) {
    try {
      const url = new URL(href);
      const { lineNumber, columnNumber } = parseHashReference(url.hash.slice(1));

      return {
        absoluteFilePath: normalizeFilePath(decodeHrefSegment(url.pathname)),
        lineNumber,
        columnNumber,
      };
    } catch {
      return {
        absoluteFilePath: null,
        lineNumber: null,
        columnNumber: null,
      };
    }
  }

  const { pathname, fragment } = splitHref(href);
  const decodedPathname = decodeHrefSegment(pathname);
  const {
    filePath,
    lineNumber: pathLineNumber,
    columnNumber: pathColumnNumber,
  } = parseFilePathReference(decodedPathname);

  if (!filePath.startsWith('/')) {
    return {
      absoluteFilePath: null,
      lineNumber: null,
      columnNumber: null,
    };
  }

  const {
    lineNumber: hashLineNumber,
    columnNumber: hashColumnNumber,
  } = fragment ? parseHashReference(fragment) : {
    lineNumber: null,
    columnNumber: null,
  };

  return {
    absoluteFilePath: normalizeFilePath(filePath),
    lineNumber: hashLineNumber ?? pathLineNumber,
    columnNumber: hashColumnNumber ?? pathColumnNumber,
  };
}

export function parseMarkdownFileLink(
  href: string,
  repoPath: string,
): ParsedMarkdownFileLink | null {
  const {
    absoluteFilePath,
    lineNumber,
    columnNumber,
  } = parseAbsoluteFilePath(href.trim());

  if (absoluteFilePath === null) {
    return null;
  }

  const normalizedRepoPath = normalizeFilePath(repoPath);

  if (
    absoluteFilePath !== normalizedRepoPath &&
    !absoluteFilePath.startsWith(`${normalizedRepoPath}/`)
  ) {
    return null;
  }

  const relativeFilePath = absoluteFilePath.slice(normalizedRepoPath.length).replace(/^\/+/, '');

  if (relativeFilePath === '') {
    return null;
  }

  return {
    absoluteFilePath,
    relativeFilePath,
    lineNumber,
    columnNumber,
  };
}
