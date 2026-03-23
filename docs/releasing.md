# Releasing

Devland uses one shared release tag for the app and all bundled extensions.

## Tag format

- `vX.Y.Z`
- Example: `v0.2.0`

## Before tagging

Set the same version in:

- `devland-app/package.json`
- `extensions/*/package.json`
- `extensions/*/devland.json`

The release workflow validates those files against the pushed tag and fails fast on drift.

## What the workflow publishes

For each `vX.Y.Z` tag:

- app artifacts from `devland-app/out/make`
- extension archives from `extensions/*/*.tgz`

Each extension archive is attached to the same GitHub Release, so repository configs can point to assets like:

- `github:rafbgarcia/devland@v0.2.0#gh-prs.tgz`
- `github:rafbgarcia/devland@v0.2.0#gh-issues.tgz`
- `github:rafbgarcia/devland@v0.2.0#channels.tgz`

## Release flow

1. Run `bun run scripts/release.ts 0.2.0`.
2. The script validates the version, updates the managed version files, commits `chore: release v0.2.0`, creates tag `v0.2.0`, and pushes the branch plus tag to `origin`.
3. Wait for the `Release` GitHub Actions workflow to publish the assets.
