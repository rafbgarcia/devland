#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const releaseTag = process.argv[2]?.trim();

if (!releaseTag) {
  console.error('Usage: node scripts/validate-sdk-release.mjs <tag>');
  process.exit(1);
}

if (!/^sdk\/v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$/.test(releaseTag)) {
  console.error(
    `SDK release tag "${releaseTag}" must use the sdk/vX.Y.Z format (optionally with prerelease/build metadata).`,
  );
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedVersion = releaseTag.slice('sdk/v'.length);

const readJsonFile = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));

const sdkPackageRelativePath = 'packages/devland-sdk/package.json';
const sdkPackage = readJsonFile(sdkPackageRelativePath);

if (sdkPackage.version !== expectedVersion) {
  console.error(
    `SDK release validation failed for tag ${releaseTag}. Expected version ${expectedVersion}, found ${JSON.stringify(sdkPackage.version)} in ${sdkPackageRelativePath}.`,
  );
  process.exit(1);
}

console.log(`SDK release validation passed for ${releaseTag}.`);
