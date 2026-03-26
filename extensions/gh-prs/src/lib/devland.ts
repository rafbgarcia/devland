import {
  createDevlandClient,
  type DevlandHostContext,
  type DevlandPromptRequestAssetResult,
  type DevlandRunCommandResult,
} from '@devlandapp/sdk';
import { z } from 'zod';

const devland = createDevlandClient();

export const getExtensionContext = async (): Promise<DevlandHostContext> =>
  await devland.getContext();

export const subscribeToExtensionContext = (
  listener: (context: DevlandHostContext) => void,
): (() => void) => devland.subscribeToContext(listener);

export const getPromptRequestAsset = async (input: {
  ref: string;
  path: string;
  mimeType: string;
}): Promise<DevlandPromptRequestAssetResult> =>
  await devland.getPromptRequestAsset(input);

const getCommandErrorMessage = (
  command: string,
  result: DevlandRunCommandResult,
): string => {
  const detail = result.stderr.trim() || result.stdout.trim();

  return detail || `Command "${command}" failed with exit code ${result.exitCode}.`;
};

export const runCommandResult = async (input: {
  command: string;
  args: string[];
  cwd?: string | null;
}): Promise<DevlandRunCommandResult> => {
  return await devland.runCommand(input);
};

const runCommand = async (input: {
  command: string;
  args: string[];
  cwd?: string | null;
}): Promise<string> => {
  const result = await runCommandResult(input);

  if (result.exitCode !== 0) {
    throw new Error(getCommandErrorMessage(input.command, result));
  }

  return result.stdout;
};

export const runJsonCommand = async <T>(
  input: {
    command: string;
    args: string[];
    cwd?: string | null;
  },
  schema: z.ZodType<T>,
): Promise<T> => {
  const stdout = await runCommand(input);

  let parsedOutput: unknown;

  try {
    parsedOutput = JSON.parse(stdout);
  } catch {
    throw new Error(`Command "${input.command}" returned invalid JSON.`);
  }

  return schema.parse(parsedOutput);
};
