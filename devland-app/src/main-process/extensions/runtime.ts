import { execFile, type ExecFileException } from 'node:child_process';
import { promisify } from 'node:util';

import {
  DevlandRunCommandResultSchema,
  type DevlandRunCommandResult,
} from '@devlandapp/sdk';

import { type RunExtensionCommandInput } from '@/extensions/contracts';
import { getRepoExtensionById } from '@/main-process/extensions/repo-extensions';
import { ghExecutable } from '@/main-process/gh-cli';

const execFileAsync = promisify(execFile);
const EXTENSION_COMMAND_TIMEOUT_MS = 30_000;
const EXTENSION_COMMAND_MAX_BUFFER_BYTES = 4 * 1024 * 1024;

const toText = (value: string | Buffer | null | undefined): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }

  return '';
};

const isExecFileFailure = (error: unknown): error is ExecFileException & {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
} => error instanceof Error;

const resolveAllowedCommand = (
  commands: readonly string[],
  extensionId: string,
  command: string,
): string => {
  if (!commands.includes(command)) {
    throw new Error(`Extension ${extensionId} is not allowed to run '${command}'.`);
  }

  if (command === 'gh') {
    if (ghExecutable === null) {
      throw new Error('GitHub CLI is not available on this machine.');
    }

    return ghExecutable;
  }

  return command;
};

export const runExtensionCommand = async (
  input: RunExtensionCommandInput,
): Promise<DevlandRunCommandResult> => {
  const repoExtension = await getRepoExtensionById(input.repoPath, input.extensionId);

  if (repoExtension.status !== 'ready' && repoExtension.status !== 'update-available') {
    throw new Error(`Extension ${input.extensionId} is not installed yet.`);
  }

  const executable = resolveAllowedCommand(
    repoExtension.commands,
    input.extensionId,
    input.command,
  );

  const options = {
    cwd: input.cwd ?? input.repoPath,
    env: {
      ...process.env,
      GH_PROMPT_DISABLED: '1',
    },
    timeout: EXTENSION_COMMAND_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: EXTENSION_COMMAND_MAX_BUFFER_BYTES,
  } as const;

  try {
    const { stdout, stderr } = await execFileAsync(executable, input.args, options);

    return DevlandRunCommandResultSchema.parse({
      stdout,
      stderr,
      exitCode: 0,
    });
  } catch (error) {
    if (!isExecFileFailure(error)) {
      throw error;
    }

    return DevlandRunCommandResultSchema.parse({
      stdout: toText(error.stdout),
      stderr: toText(error.stderr) || error.message,
      exitCode: typeof error.code === 'number' ? error.code : -1,
    });
  }
};
