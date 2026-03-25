# Releasing

Devland has two release lanes:

- shared app release tags for the app and bundled extensions
- separate SDK release tags for `@devlandapp/sdk`

## Shared app release tags

Tag format:

- `vX.Y.Z`
- Example: `v0.2.0`

Before tagging, set the same version in:

- `devland-app/package.json`
- `extensions/*/package.json`
- `extensions/*/devland.json`

The shared release workflow validates those files against the pushed tag and fails fast on drift.

For each `vX.Y.Z` tag, the workflow publishes:

- desktop release artifacts from `devland-app/out/release`
- extension archives from `extensions/*/*.tgz`

Each extension archive is attached to the same GitHub Release, so repository configs can point to assets like:

- `github:rafbgarcia/devland@v0.2.0#gh-prs.tgz`
- `github:rafbgarcia/devland@v0.2.0#gh-issues.tgz`
- `github:rafbgarcia/devland@v0.2.0#channels.tgz`

Shared release flow:

1. Run `bun run scripts/release.ts 0.2.0`.
2. The script validates the version, updates the managed version files, commits `chore: release v0.2.0`, creates tag `v0.2.0`, and pushes the branch plus tag to `origin`.
3. Wait for the `Release` GitHub Actions workflow to publish the assets.

## SDK release tags

Tag format:

- `sdk/vX.Y.Z`
- Example: `sdk/v0.1.1`

The SDK release workflow validates only:

- `packages/devland-sdk/package.json`

SDK release flow:

1. Run `bun run scripts/release-sdk.ts 0.1.1`.
2. The script validates the version, updates `packages/devland-sdk/package.json`, commits `chore: release sdk/v0.1.1`, creates tag `sdk/v0.1.1`, and pushes the branch plus tag to `origin`.
3. Wait for the `Release SDK` GitHub Actions workflow to publish `@devlandapp/sdk` to npm.

The SDK workflow requires the `NPM_TOKEN` GitHub Actions secret with publish access to the `@devlandapp/sdk` package on npm.

## Desktop auto-update

The desktop app now follows a manual-update architecture:

- background checks on startup plus a polling interval
- no automatic download or install
- a subtle in-app button appears when an update is available
- clicking once downloads the update; clicking again restarts and installs it

Release artifacts must stay compatible with `electron-updater`. The release workflow builds:

- macOS `dmg` and `zip`
- Windows `nsis`
- Linux `AppImage`
- updater metadata such as `latest*.yml` and `*.blockmap`

The updater defaults to the public GitHub release feed for `rafbgarcia/devland`. Override it at build or runtime with `DEVLAND_UPDATE_REPOSITORY=owner/repo` when needed.

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
