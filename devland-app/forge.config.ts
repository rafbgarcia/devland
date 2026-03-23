import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { DevAppLauncherPlugin } from './forge.dev-app';

const macBundleId = 'com.rafbgarcia.devland';
const isMacSigningEnabled = process.env.DEVLAND_MAC_SIGNING_ENABLED === 'true';
const appleApiKey = process.env.APPLE_API_KEY;
const appleApiKeyId = process.env.APPLE_API_KEY_ID;
const appleApiIssuer = process.env.APPLE_API_ISSUER;

if (
  isMacSigningEnabled &&
  (!appleApiKey || !appleApiKeyId || !appleApiIssuer)
) {
  throw new Error(
    'macOS signing is enabled, but APPLE_API_KEY, APPLE_API_KEY_ID, or APPLE_API_ISSUER is missing.',
  );
}

const packagerConfig: ForgeConfig['packagerConfig'] = {
  asar: true,
  icon: path.resolve(__dirname, 'assets/icons/devland'),
  appBundleId: macBundleId,
  appCategoryType: 'public.app-category.developer-tools',
};

if (isMacSigningEnabled) {
  packagerConfig.osxSign = {};
  packagerConfig.osxNotarize = {
    appleApiKey: appleApiKey!,
    appleApiKeyId: appleApiKeyId!,
    appleApiIssuer: appleApiIssuer!,
  };
}

const config: ForgeConfig = {
  packagerConfig,
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      setupIcon: path.resolve(__dirname, 'assets/icons/devland.ico'),
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({
      options: {
        bin: 'Devland',
        icon: path.resolve(__dirname, 'assets/icons/devland.png'),
      },
    }),
    new MakerDeb({
      options: {
        bin: 'Devland',
        icon: path.resolve(__dirname, 'assets/icons/devland.png'),
      },
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
    new DevAppLauncherPlugin({
      displayName: 'Devland:dev',
      bundleId: 'com.rafbgarcia.devland.dev',
      iconPath: path.resolve(__dirname, 'assets/icons/devland.icns'),
    }),
  ],
};

export default config;
