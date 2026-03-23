#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const releaseTag = process.argv[2]?.trim();

if (!releaseTag) {
  console.error('Usage: node scripts/validate-release.mjs <tag>');
  process.exit(1);
}

if (!/^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$/.test(releaseTag)) {
  console.error(
    `Release tag "${releaseTag}" must use the vX.Y.Z format (optionally with prerelease/build metadata).`,
  );
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedVersion = releaseTag.slice(1);

const readJsonFile = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));

const versionEntries = [
  {
    label: 'devland-app package',
    relativePath: 'devland-app/package.json',
    version: readJsonFile('devland-app/package.json').version,
  },
];

const extensionsRoot = path.join(repoRoot, 'extensions');
const extensionDirectories = fs
  .readdirSync(extensionsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right));

for (const extensionDirectory of extensionDirectories) {
  const packageRelativePath = `extensions/${extensionDirectory}/package.json`;
  const manifestRelativePath = `extensions/${extensionDirectory}/devland.json`;
  const extensionPackage = readJsonFile(packageRelativePath);
  const extensionManifest = readJsonFile(manifestRelativePath);

  versionEntries.push(
    {
      label: `${extensionDirectory} package`,
      relativePath: packageRelativePath,
      version: extensionPackage.version,
    },
    {
      label: `${extensionDirectory} manifest`,
      relativePath: manifestRelativePath,
      version: extensionManifest.version,
    },
  );
}

const mismatches = versionEntries.filter((entry) => entry.version !== expectedVersion);

if (mismatches.length > 0) {
  console.error(`Release validation failed for tag ${releaseTag}. Expected version ${expectedVersion}.`);

  for (const mismatch of mismatches) {
    console.error(
      `- ${mismatch.label} at ${mismatch.relativePath} is ${JSON.stringify(mismatch.version)}`,
    );
  }

  process.exit(1);
}

console.log(`Release validation passed for ${releaseTag}.`);
