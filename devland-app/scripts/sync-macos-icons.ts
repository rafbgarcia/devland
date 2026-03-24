import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const iconSizes = [16, 32, 128, 256, 512] as const;
const scriptDir = __dirname;
const projectDir = path.resolve(scriptDir, '..');
const iconsDir = path.join(projectDir, 'assets', 'icons');

const sourcePngPath = path.join(iconsDir, 'devland-1024.png');
const generatedPngPath = path.join(iconsDir, 'devland.png');
const generatedIconsetDir = path.join(iconsDir, 'devland.iconset');
const generatedIcnsPath = path.join(iconsDir, 'devland.icns');

const runCommand = (command: string, args: string[]): void => {
  execFileSync(command, args, { stdio: 'pipe' });
};

export const syncMacosIcons = (): boolean => {
  if (process.platform !== 'darwin') {
    return false;
  }

  if (!existsSync(sourcePngPath)) {
    throw new Error(`Missing canonical macOS icon source at ${sourcePngPath}`);
  }

  mkdirSync(generatedIconsetDir, { recursive: true });

  for (const size of iconSizes) {
    const standardOutputPath = path.join(generatedIconsetDir, `icon_${size}x${size}.png`);
    const retinaOutputPath = path.join(generatedIconsetDir, `icon_${size}x${size}@2x.png`);

    runCommand('sips', [
      '-z',
      `${size}`,
      `${size}`,
      sourcePngPath,
      '--out',
      standardOutputPath,
    ]);

    runCommand('sips', [
      '-z',
      `${size * 2}`,
      `${size * 2}`,
      sourcePngPath,
      '--out',
      retinaOutputPath,
    ]);
  }

  runCommand('sips', ['-z', '512', '512', sourcePngPath, '--out', generatedPngPath]);

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'devland-icon-build-'));
  const tempIconsetDir = path.join(tempRoot, 'devland.iconset');

  try {
    runCommand('cp', ['-R', generatedIconsetDir, tempIconsetDir]);
    runCommand('iconutil', ['-c', 'icns', tempIconsetDir, '-o', generatedIcnsPath]);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  return true;
};

const isEntrypoint = require.main === module;

if (isEntrypoint) {
  syncMacosIcons();
  console.log('Synchronized macOS icon assets from devland-1024.png');
}
