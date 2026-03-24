type Semver = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  raw: string;
};

const VERSION_PATTERN =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z.-]+))?(?:\+(?<build>[0-9A-Za-z.-]+))?$/;

export const parseSemver = (value: string): Semver => {
  const match = value.trim().match(VERSION_PATTERN);

  if (
    !match?.groups?.major ||
    !match.groups.minor ||
    !match.groups.patch
  ) {
    throw new Error(
      `Version "${value}" must use semver like 0.1.2 or 0.1.2-beta.1.`,
    );
  }

  return {
    major: Number.parseInt(match.groups.major, 10),
    minor: Number.parseInt(match.groups.minor, 10),
    patch: Number.parseInt(match.groups.patch, 10),
    prerelease: match.groups.prerelease?.split('.').filter(Boolean) ?? [],
    raw: `${match.groups.major}.${match.groups.minor}.${match.groups.patch}${match.groups.prerelease ? `-${match.groups.prerelease}` : ''}`,
  };
};

const comparePrereleaseIdentifiers = (left: string, right: string): number => {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) {
    return Number.parseInt(left, 10) - Number.parseInt(right, 10);
  }

  if (leftNumeric) {
    return -1;
  }

  if (rightNumeric) {
    return 1;
  }

  return left.localeCompare(right);
};

export const compareSemver = (left: string, right: string): number => {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);

  if (leftVersion.major !== rightVersion.major) {
    return leftVersion.major - rightVersion.major;
  }

  if (leftVersion.minor !== rightVersion.minor) {
    return leftVersion.minor - rightVersion.minor;
  }

  if (leftVersion.patch !== rightVersion.patch) {
    return leftVersion.patch - rightVersion.patch;
  }

  if (leftVersion.prerelease.length === 0 && rightVersion.prerelease.length === 0) {
    return 0;
  }

  if (leftVersion.prerelease.length === 0) {
    return 1;
  }

  if (rightVersion.prerelease.length === 0) {
    return -1;
  }

  const sharedLength = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];

    if (leftIdentifier === undefined) {
      return -1;
    }

    if (rightIdentifier === undefined) {
      return 1;
    }

    const comparison = comparePrereleaseIdentifiers(leftIdentifier, rightIdentifier);

    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
};

export const normalizeVersionInput = (value: string): string => value.trim().replace(/^v(?=\d)/i, '');

const GITHUB_EXTENSION_SOURCE_PATTERN =
  /^github:(?<owner>[A-Za-z0-9_.-]+)\/(?<repo>[A-Za-z0-9_.-]+)@(?<version>[^#]+)#(?<assetName>[^#]+\.tgz)$/i;

export type GitHubExtensionSourceParts = {
  owner: string;
  repo: string;
  version: string;
  assetName: string;
};

export const parseGitHubExtensionSource = (source: string): GitHubExtensionSourceParts | null => {
  const match = source.trim().match(GITHUB_EXTENSION_SOURCE_PATTERN);

  if (
    !match?.groups?.owner ||
    !match.groups.repo ||
    !match.groups.version ||
    !match.groups.assetName
  ) {
    return null;
  }

  return {
    owner: match.groups.owner,
    repo: match.groups.repo,
    version: match.groups.version,
    assetName: match.groups.assetName,
  };
};

export const rewriteGitHubExtensionSourceVersion = (source: string, version: string): string => {
  const parsedSource = parseGitHubExtensionSource(source);

  if (parsedSource === null) {
    return source;
  }

  return `github:${parsedSource.owner}/${parsedSource.repo}@v${normalizeVersionInput(version)}#${parsedSource.assetName}`;
};

export const extractVersionFromTag = (tag: string): string | null => {
  const normalizedTag = tag.trim();
  const sharedTagMatch = normalizedTag.match(/^v(?<version>.+)$/);

  if (sharedTagMatch?.groups?.version) {
    try {
      parseSemver(sharedTagMatch.groups.version);
      return sharedTagMatch.groups.version;
    } catch {
      return null;
    }
  }

  const legacyExtensionTagMatch = normalizedTag.match(/^ext\/[^/]+\/(?<version>.+)$/);

  if (legacyExtensionTagMatch?.groups?.version) {
    try {
      parseSemver(legacyExtensionTagMatch.groups.version);
      return legacyExtensionTagMatch.groups.version;
    } catch {
      return null;
    }
  }

  return null;
};

export const extractSdkVersionFromTag = (tag: string): string | null => {
  const normalizedTag = tag.trim();
  const sdkTagMatch = normalizedTag.match(/^sdk\/v(?<version>.+)$/);

  if (!sdkTagMatch?.groups?.version) {
    return null;
  }

  try {
    parseSemver(sdkTagMatch.groups.version);
    return sdkTagMatch.groups.version;
  } catch {
    return null;
  }
};
