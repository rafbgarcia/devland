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

## macOS signing and notarization

The macOS build signs and notarizes the app only when all of these GitHub Actions secrets are configured:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

Expected values:

- `CSC_LINK`: base64-encoded `Developer ID Application` `.p12` export
- `CSC_KEY_PASSWORD`: password for that `.p12`
- `APPLE_API_KEY`: raw contents of the App Store Connect `.p8` API key
- `APPLE_API_KEY_ID`: App Store Connect API key ID
- `APPLE_API_ISSUER`: App Store Connect issuer ID

If those secrets are absent, the macOS workflow still builds an unsigned zip for internal use, but end users will hit Gatekeeper warnings. With all five secrets present, the release zip is signed and notarized and should open normally after download.
