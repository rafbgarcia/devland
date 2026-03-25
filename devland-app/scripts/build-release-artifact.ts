import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const PRODUCT_NAME = 'Devland';
const APP_ID = 'com.rafbgarcia.devland';
const DEFAULT_UPDATE_REPOSITORY = 'rafbgarcia/devland';
const cwd = process.cwd();
const outDirectoryPath = path.join(cwd, 'out');
const releaseDirectoryPath = path.join(outDirectoryPath, 'release');

type BuildPlatform = 'mac' | 'linux' | 'win';

function resolveCurrentPlatform(): BuildPlatform {
  switch (process.platform) {
    case 'darwin':
      return 'mac';
    case 'linux':
      return 'linux';
    case 'win32':
      return 'win';
    default:
      throw new Error(`Unsupported release platform: ${process.platform}`);
  }
}

function parseOption(name: string): string | null {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

async function runCommand(command: string[], workdir = cwd): Promise<void> {
  const subprocess = Bun.spawn(command, {
    cwd: workdir,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = await subprocess.exited;

  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(' ')}`);
  }
}

async function findPrepackagedAppPath(platform: BuildPlatform, arch: string): Promise<string> {
  const entries = await readdir(outDirectoryPath, { withFileTypes: true });
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .filter((entry) => entry.name !== 'make' && entry.name !== 'release')
      .filter((entry) => entry.name.startsWith(`${PRODUCT_NAME}-`))
      .filter((entry) => {
        if (platform === 'mac') {
          return entry.name.includes('-darwin-');
        }
        if (platform === 'linux') {
          return entry.name.includes('-linux-');
        }
        return entry.name.includes('-win32-');
      })
      .filter((entry) => entry.name.endsWith(`-${arch}`))
      .map(async (entry) => {
        const absolutePath = path.join(outDirectoryPath, entry.name);
        const entryStat = await stat(absolutePath);

        return {
          absolutePath,
          modifiedAt: entryStat.mtimeMs,
        };
      }),
  );

  const candidate = candidates.toSorted((left, right) => right.modifiedAt - left.modifiedAt)[0];

  if (!candidate) {
    throw new Error(`Could not find a packaged ${platform}/${arch} app under ${outDirectoryPath}.`);
  }

  if (platform === 'mac') {
    return path.join(candidate.absolutePath, `${PRODUCT_NAME}.app`);
  }

  return candidate.absolutePath;
}

function parseUpdateRepository(): { owner: string; repo: string } {
  const repository =
    parseOption('--repository') ??
    process.env.DEVLAND_UPDATE_REPOSITORY?.trim() ??
    process.env.GITHUB_REPOSITORY?.trim() ??
    DEFAULT_UPDATE_REPOSITORY;
  const match = repository.match(/^([^/\s]+)\/([^/\s]+)$/);

  if (!match?.[1] || !match[2]) {
    throw new Error(
      `Invalid update repository '${repository}'. Expected owner/repo format.`,
    );
  }

  return {
    owner: match[1],
    repo: match[2],
  };
}

async function writeBuilderConfig(
  platform: BuildPlatform,
  owner: string,
  repo: string,
): Promise<string> {
  const tempDirectoryPath = await mkdtemp(path.join(os.tmpdir(), 'devland-builder-'));
  const configPath = path.join(tempDirectoryPath, 'builder-config.json');
  const config = {
    appId: APP_ID,
    productName: PRODUCT_NAME,
    directories: {
      output: releaseDirectoryPath,
    },
    publish: [
      {
        provider: 'github',
        owner,
        repo,
        releaseType: 'release',
      },
    ],
    artifactName: '${productName}-${version}-${arch}.${ext}',
    mac: {
      category: 'public.app-category.developer-tools',
      target: ['dmg', 'zip'],
    },
    dmg: {
      sign: false,
    },
    linux: {
      target: ['AppImage'],
      category: 'Development',
    },
    win: {
      target: ['nsis'],
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: false,
    },
  } satisfies Record<string, unknown>;

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  return configPath;
}

async function main(): Promise<void> {
  const platform = (parseOption('--platform') as BuildPlatform | null) ?? resolveCurrentPlatform();
  const arch = parseOption('--arch') ?? process.arch;
  const updateRepository = parseUpdateRepository();

  await rm(releaseDirectoryPath, { recursive: true, force: true });
  await runCommand(['bun', 'x', 'electron-forge', 'package']);

  const prepackagedAppPath = await findPrepackagedAppPath(platform, arch);
  const builderConfigPath = await writeBuilderConfig(
    platform,
    updateRepository.owner,
    updateRepository.repo,
  );

  const builderCommand = [
    'bun',
    'x',
    'electron-builder',
    '--prepackaged',
    prepackagedAppPath,
    '--config',
    builderConfigPath,
    '--publish',
    'never',
  ];

  if (platform === 'mac') {
    builderCommand.push('--mac', 'dmg', 'zip');
  } else if (platform === 'linux') {
    builderCommand.push('--linux', 'AppImage');
  } else {
    builderCommand.push('--win', 'nsis');
  }

  if (arch === 'x64') {
    builderCommand.push('--x64');
  } else if (arch === 'arm64') {
    builderCommand.push('--arm64');
  }

  try {
    await runCommand(builderCommand);
  } finally {
    await rm(path.dirname(builderConfigPath), { recursive: true, force: true });
  }
}

await main();
