import { execFile, spawn, type SpawnOptions } from 'node:child_process';
import { access, lstat } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  AvailableExternalEditorSchema,
  EXTERNAL_EDITOR_TARGET_COLUMN_ARGUMENT,
  EXTERNAL_EDITOR_TARGET_LINE_ARGUMENT,
  EXTERNAL_EDITOR_TARGET_PATH_ARGUMENT,
  OpenFileInExternalEditorInputSchema,
  PickedExternalEditorPathSchema,
  ValidateExternalEditorPathResultSchema,
  type AvailableExternalEditor,
  type ExternalEditorPreference,
  type OpenFileInExternalEditorInput,
  type PickedExternalEditorPath,
  type ValidateExternalEditorPathResult,
} from '@/ipc/contracts';

const execFileAsync = promisify(execFile);

type DarwinExternalEditor = {
  id: string;
  name: string;
  bundleIdentifiers: string[];
};

type ResolvedDetectedExternalEditor = {
  editor: AvailableExternalEditor;
  path: string;
};

type ExternalEditorLaunchSpec = {
  executablePath: string;
  args: string[];
  spawnMode: 'direct' | 'darwin-open-files' | 'darwin-open-args';
};

type ExternalEditorLaunchTarget = {
  targetPath: string;
  lineNumber?: number | null;
  columnNumber?: number | null;
};

const DARWIN_EXTERNAL_EDITORS: readonly DarwinExternalEditor[] = [
  {
    id: 'com.microsoft.VSCode',
    name: 'Visual Studio Code',
    bundleIdentifiers: ['com.microsoft.VSCode'],
  },
  {
    id: 'com.microsoft.VSCodeInsiders',
    name: 'Visual Studio Code (Insiders)',
    bundleIdentifiers: ['com.microsoft.VSCodeInsiders'],
  },
  {
    id: 'com.visualstudio.code.oss',
    name: 'VSCodium',
    bundleIdentifiers: ['com.visualstudio.code.oss', 'com.vscodium'],
  },
  {
    id: 'com.apple.dt.Xcode',
    name: 'Xcode',
    bundleIdentifiers: ['com.apple.dt.Xcode'],
  },
  {
    id: 'com.google.android.studio',
    name: 'Android Studio',
    bundleIdentifiers: ['com.google.android.studio'],
  },
  {
    id: 'dev.zed.Zed',
    name: 'Zed',
    bundleIdentifiers: ['dev.zed.Zed'],
  },
  {
    id: 'dev.zed.Zed-Preview',
    name: 'Zed (Preview)',
    bundleIdentifiers: ['dev.zed.Zed-Preview'],
  },
  {
    id: 'com.todesktop.230313mzl4w4u92',
    name: 'Cursor',
    bundleIdentifiers: ['com.todesktop.230313mzl4w4u92'],
  },
  {
    id: 'com.exafunction.windsurf',
    name: 'Windsurf',
    bundleIdentifiers: ['com.exafunction.windsurf'],
  },
  {
    id: 'com.jetbrains.WebStorm',
    name: 'WebStorm',
    bundleIdentifiers: ['com.jetbrains.WebStorm'],
  },
  {
    id: 'com.jetbrains.intellij',
    name: 'IntelliJ IDEA',
    bundleIdentifiers: ['com.jetbrains.intellij'],
  },
  {
    id: 'com.jetbrains.intellij.ce',
    name: 'IntelliJ IDEA Community Edition',
    bundleIdentifiers: ['com.jetbrains.intellij.ce'],
  },
  {
    id: 'com.jetbrains.PyCharm',
    name: 'PyCharm',
    bundleIdentifiers: ['com.jetbrains.PyCharm'],
  },
  {
    id: 'com.jetbrains.pycharm.ce',
    name: 'PyCharm Community Edition',
    bundleIdentifiers: ['com.jetbrains.pycharm.ce'],
  },
  {
    id: 'com.jetbrains.RubyMine',
    name: 'RubyMine',
    bundleIdentifiers: ['com.jetbrains.RubyMine'],
  },
  {
    id: 'com.jetbrains.CLion',
    name: 'CLion',
    bundleIdentifiers: ['com.jetbrains.CLion'],
  },
  {
    id: 'com.jetbrains.goland',
    name: 'GoLand',
    bundleIdentifiers: ['com.jetbrains.goland'],
  },
  {
    id: 'com.jetbrains.RustRover',
    name: 'RustRover',
    bundleIdentifiers: ['com.jetbrains.RustRover'],
  },
  {
    id: 'com.panic.Nova',
    name: 'Nova',
    bundleIdentifiers: ['com.panic.Nova'],
  },
];

let detectedEditorsCache: ReadonlyArray<ResolvedDetectedExternalEditor> | null = null;

const isPathAccessible = async (filePath: string) =>
  access(filePath, fsConstants.F_OK)
    .then(() => true)
    .catch(() => false);

const getDarwinBundleId = async (editorPath: string): Promise<string | undefined> => {
  if (!editorPath.endsWith('.app')) {
    return undefined;
  }

  try {
    const { stdout } = await execFileAsync(
      'mdls',
      ['-name', 'kMDItemCFBundleIdentifier', '-raw', editorPath],
      { windowsHide: true },
    );
    const bundleId = stdout.trim();

    return bundleId && bundleId !== '(null)' ? bundleId : undefined;
  } catch {
    return undefined;
  }
};

export const validateExternalEditorPath = async (
  editorPath: string,
): Promise<ValidateExternalEditorPathResult> => {
  const trimmedPath = editorPath.trim();

  if (trimmedPath === '') {
    return ValidateExternalEditorPathResultSchema.parse({ isValid: false });
  }

  try {
    const pathStats = await lstat(trimmedPath);
    const isExecutableFile =
      (pathStats.isFile() || pathStats.isSymbolicLink()) &&
      (await access(trimmedPath, fsConstants.X_OK)
        .then(() => true)
        .catch(() => false));

    let bundleId: string | undefined;

    if (process.platform === 'darwin' && !isExecutableFile && pathStats.isDirectory()) {
      bundleId = await getDarwinBundleId(trimmedPath);
    }

    return ValidateExternalEditorPathResultSchema.parse({
      isValid: isExecutableFile || bundleId !== undefined,
      bundleId,
    });
  } catch {
    return ValidateExternalEditorPathResultSchema.parse({ isValid: false });
  }
};

const quoteShellArgument = (value: string) => {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
    return value;
  }

  return `"${value.replaceAll(/["\\$`]/g, '\\$&')}"`;
};

const parseArgumentString = (value: string): string[] => {
  const trimmedValue = value.trim();

  if (trimmedValue === '') {
    return [];
  }

  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < trimmedValue.length; index += 1) {
    const char = trimmedValue[index]!;

    if (quote === null && /\s/.test(char)) {
      if (current !== '') {
        args.push(current);
        current = '';
      }

      continue;
    }

    if (char === '\\') {
      const nextChar = trimmedValue[index + 1];

      if (nextChar !== undefined) {
        current += nextChar;
        index += 1;
        continue;
      }
    }

    if (char === '"' || char === "'") {
      if (quote === char) {
        quote = null;
        continue;
      }

      if (quote === null) {
        quote = char;
        continue;
      }
    }

    current += char;
  }

  if (current !== '') {
    args.push(current);
  }

  return args;
};

const CODE_LIKE_EDITOR_IDS = new Set([
  'com.microsoft.VSCode',
  'com.microsoft.VSCodeInsiders',
  'com.visualstudio.code.oss',
  'com.vscodium',
  'com.todesktop.230313mzl4w4u92',
  'com.exafunction.windsurf',
]);

const JETBRAINS_EDITOR_IDS = new Set([
  'com.google.android.studio',
  'com.jetbrains.WebStorm',
  'com.jetbrains.intellij',
  'com.jetbrains.intellij.ce',
  'com.jetbrains.PyCharm',
  'com.jetbrains.pycharm.ce',
  'com.jetbrains.RubyMine',
  'com.jetbrains.CLion',
  'com.jetbrains.goland',
  'com.jetbrains.RustRover',
]);

const normalizeEditorPosition = ({
  lineNumber,
  columnNumber,
}: {
  lineNumber: number | null | undefined;
  columnNumber: number | null | undefined;
}): {
  lineNumber: number | null;
  columnNumber: number | null;
} => ({
  lineNumber: lineNumber ?? null,
  columnNumber: columnNumber ?? null,
});

const buildCodeLikeGotoTarget = ({
  targetPath,
  lineNumber,
  columnNumber,
}: ExternalEditorLaunchTarget): string => {
  if (lineNumber === null || lineNumber === undefined) {
    return targetPath;
  }

  return columnNumber === null || columnNumber === undefined
    ? `${targetPath}:${lineNumber}`
    : `${targetPath}:${lineNumber}:${columnNumber}`;
};

const buildZedTarget = ({
  targetPath,
  lineNumber,
  columnNumber,
}: ExternalEditorLaunchTarget): string => {
  if (lineNumber === null || lineNumber === undefined) {
    return targetPath;
  }

  return `${targetPath}:${lineNumber}:${columnNumber ?? 1}`;
};

export const expandTargetPathArgument = (
  args: readonly string[],
  { targetPath, lineNumber, columnNumber }: ExternalEditorLaunchTarget,
): string[] => args.map((arg) => arg
  .replaceAll(EXTERNAL_EDITOR_TARGET_PATH_ARGUMENT, targetPath)
  .replaceAll(EXTERNAL_EDITOR_TARGET_LINE_ARGUMENT, String(lineNumber ?? 1))
  .replaceAll(EXTERNAL_EDITOR_TARGET_COLUMN_ARGUMENT, String(columnNumber ?? 1)));

const getCodeLikeCliPath = (editorId: string, editorPath: string): string | null => {
  if (editorId === 'com.microsoft.VSCodeInsiders') {
    return path.join(editorPath, 'Contents', 'Resources', 'app', 'bin', 'code-insiders');
  }

  if (editorId === 'com.visualstudio.code.oss' || editorId === 'com.vscodium') {
    return path.join(editorPath, 'Contents', 'Resources', 'app', 'bin', 'codium');
  }

  if (editorId === 'com.todesktop.230313mzl4w4u92') {
    return path.join(editorPath, 'Contents', 'Resources', 'app', 'bin', 'cursor');
  }

  if (editorId === 'com.exafunction.windsurf') {
    return path.join(editorPath, 'Contents', 'Resources', 'app', 'bin', 'windsurf');
  }

  if (CODE_LIKE_EDITOR_IDS.has(editorId)) {
    return path.join(editorPath, 'Contents', 'Resources', 'app', 'bin', 'code');
  }

  return null;
};

const getJetBrainsCliPath = async (editorPath: string): Promise<string | null> => {
  try {
    const infoPlistPath = path.join(editorPath, 'Contents', 'Info.plist');
    const { stdout } = await execFileAsync(
      '/usr/libexec/PlistBuddy',
      ['-c', 'Print :CFBundleExecutable', infoPlistPath],
      { windowsHide: true },
    );
    const executableName = stdout.trim();

    if (executableName === '') {
      return null;
    }

    return path.join(editorPath, 'Contents', 'MacOS', executableName);
  } catch {
    return null;
  }
};

export const buildDetectedExternalEditorLaunchSpec = async ({
  editorId,
  editorPath,
  targetPath,
  lineNumber,
  columnNumber,
}: {
  editorId: string;
  editorPath: string;
} & ExternalEditorLaunchTarget): Promise<ExternalEditorLaunchSpec> => {
  const position = normalizeEditorPosition({ lineNumber, columnNumber });

  if (CODE_LIKE_EDITOR_IDS.has(editorId)) {
    const cliPath = getCodeLikeCliPath(editorId, editorPath);

    if (cliPath !== null && await isPathAccessible(cliPath)) {
      return {
        executablePath: cliPath,
        args: position.lineNumber === null
          ? [targetPath]
          : ['--goto', buildCodeLikeGotoTarget({
              targetPath,
              lineNumber: position.lineNumber,
              columnNumber: position.columnNumber,
            })],
        spawnMode: 'direct',
      };
    }
  }

  if (editorId === 'dev.zed.Zed' || editorId === 'dev.zed.Zed-Preview') {
    const cliPath = path.join(editorPath, 'Contents', 'MacOS', 'cli');

    if (await isPathAccessible(cliPath)) {
      return {
        executablePath: cliPath,
        args: [buildZedTarget({
          targetPath,
          lineNumber: position.lineNumber,
          columnNumber: position.columnNumber,
        })],
        spawnMode: 'direct',
      };
    }
  }

  if (editorId === 'com.apple.dt.Xcode') {
    const cliPath = path.join(editorPath, 'Contents', 'Developer', 'usr', 'bin', 'xed');

    if (await isPathAccessible(cliPath)) {
      return {
        executablePath: cliPath,
        args: position.lineNumber === null
          ? [targetPath]
          : ['--line', String(position.lineNumber), targetPath],
        spawnMode: 'direct',
      };
    }
  }

  if (JETBRAINS_EDITOR_IDS.has(editorId)) {
    const cliPath = await getJetBrainsCliPath(editorPath);

    if (cliPath !== null && await isPathAccessible(cliPath)) {
      return {
        executablePath: cliPath,
        args: position.lineNumber === null
          ? [targetPath]
          : [
              '--line',
              String(position.lineNumber),
              ...(position.columnNumber === null ? [] : ['--column', String(position.columnNumber)]),
              targetPath,
            ],
        spawnMode: 'direct',
      };
    }
  }

  return {
    executablePath: editorPath,
    args: [targetPath],
    spawnMode: 'darwin-open-files',
  };
};

const launchEditorProcess = async (
  editorPath: string,
  args: readonly string[],
  spawnMode: 'direct' | 'darwin-open-files' | 'darwin-open-args',
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const options: SpawnOptions = {
      detached: true,
      stdio: 'ignore',
    };
    const child =
      spawnMode === 'darwin-open-files'
        ? spawn('open', ['-a', editorPath, ...args], options)
        : spawnMode === 'darwin-open-args'
          ? spawn('open', ['-a', editorPath, '--args', ...args], options)
          : spawn(editorPath, args, options);

    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
};

const findDarwinApplication = async (
  bundleIdentifier: string,
): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync(
      'mdfind',
      [`kMDItemCFBundleIdentifier == '${bundleIdentifier}'`],
      { windowsHide: true, timeout: 4000 },
    );
    const matches = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    for (const match of matches) {
      if (await isPathAccessible(match)) {
        return match;
      }
    }

    return null;
  } catch {
    return null;
  }
};

const resolveDarwinDetectedEditors = async (): Promise<
  ReadonlyArray<ResolvedDetectedExternalEditor>
> => {
  const resolvedEditors: ResolvedDetectedExternalEditor[] = [];

  for (const candidate of DARWIN_EXTERNAL_EDITORS) {
    for (const bundleIdentifier of candidate.bundleIdentifiers) {
      const installPath = await findDarwinApplication(bundleIdentifier);

      if (installPath === null) {
        continue;
      }

      resolvedEditors.push({
        editor: AvailableExternalEditorSchema.parse({
          id: candidate.id,
          name: candidate.name,
        }),
        path: installPath,
      });
      break;
    }
  }

  return resolvedEditors;
};

const getDetectedExternalEditors = async (): Promise<
  ReadonlyArray<ResolvedDetectedExternalEditor>
> => {
  if (detectedEditorsCache !== null) {
    return detectedEditorsCache;
  }

  if (process.platform === 'darwin') {
    detectedEditorsCache = await resolveDarwinDetectedEditors();
    return detectedEditorsCache;
  }

  detectedEditorsCache = [];
  return detectedEditorsCache;
};

export const listAvailableExternalEditors = async (): Promise<
  AvailableExternalEditor[]
> => {
  const editors = await getDetectedExternalEditors();

  return editors.map(({ editor }) => editor);
};

export const pickExternalEditorPath = async (
  pickPath: () => Promise<string | null>,
): Promise<PickedExternalEditorPath | null> => {
  const selectedPath = await pickPath();

  if (selectedPath === null) {
    return null;
  }

  const validation = await validateExternalEditorPath(selectedPath);

  return PickedExternalEditorPathSchema.parse({
    path: selectedPath,
    bundleId: validation.bundleId,
  });
};

const ensureFileExists = async (repoPath: string, relativeFilePath: string) => {
  const absolutePath = path.resolve(repoPath, relativeFilePath);

  if (!(await isPathAccessible(absolutePath))) {
    throw new Error(`Could not find ${relativeFilePath} in this worktree.`);
  }

  return absolutePath;
};

const launchDetectedExternalEditor = async (
  target: ExternalEditorLaunchTarget,
  preference: Extract<ExternalEditorPreference, { kind: 'detected' }>,
) => {
  const editors = await getDetectedExternalEditors();
  const matchingEditor = editors.find(
    ({ editor }) => editor.id === preference.editorId,
  );

  if (!matchingEditor) {
    throw new Error(
      `${preference.editorName} is no longer available. Choose another editor in settings.`,
    );
  }

  const launchSpec = process.platform === 'darwin'
    ? await buildDetectedExternalEditorLaunchSpec({
        editorId: matchingEditor.editor.id,
        editorPath: matchingEditor.path,
        ...target,
      })
    : {
        executablePath: matchingEditor.path,
        args: [target.targetPath],
        spawnMode: 'direct' as const,
      };

  await launchEditorProcess(
    launchSpec.executablePath,
    launchSpec.args,
    launchSpec.spawnMode,
  );
};

const launchCustomExternalEditor = async (
  target: ExternalEditorLaunchTarget,
  preference: Extract<ExternalEditorPreference, { kind: 'custom' }>,
) => {
  const validation = await validateExternalEditorPath(preference.path);

  if (!validation.isValid) {
    throw new Error('The custom editor path is invalid or no longer accessible.');
  }

  const parsedArgs = parseArgumentString(preference.arguments);

  if (!parsedArgs.some((arg) => arg.includes(EXTERNAL_EDITOR_TARGET_PATH_ARGUMENT))) {
    throw new Error(
      `Custom editor arguments must include ${quoteShellArgument(EXTERNAL_EDITOR_TARGET_PATH_ARGUMENT)}.`,
    );
  }

  await launchEditorProcess(
    preference.path,
    expandTargetPathArgument(parsedArgs, target),
    process.platform === 'darwin' && validation.bundleId !== undefined
      ? 'darwin-open-args'
      : 'direct',
  );
};

export const openFileInExternalEditor = async (
  input: OpenFileInExternalEditorInput,
): Promise<void> => {
  const parsedInput = OpenFileInExternalEditorInputSchema.parse(input);
  const targetPath = await ensureFileExists(
    parsedInput.repoPath,
    parsedInput.relativeFilePath,
  );

  if (parsedInput.preference.kind === 'detected') {
    await launchDetectedExternalEditor({
      targetPath,
      ...(parsedInput.lineNumber !== undefined ? { lineNumber: parsedInput.lineNumber } : {}),
      ...(parsedInput.columnNumber !== undefined
        ? { columnNumber: parsedInput.columnNumber }
        : {}),
    }, parsedInput.preference);
    return;
  }

  await launchCustomExternalEditor({
    targetPath,
    ...(parsedInput.lineNumber !== undefined ? { lineNumber: parsedInput.lineNumber } : {}),
    ...(parsedInput.columnNumber !== undefined
      ? { columnNumber: parsedInput.columnNumber }
      : {}),
  }, parsedInput.preference);
};
