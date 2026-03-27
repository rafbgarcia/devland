import {
  createDevlandClient,
  type DevlandHostContext,
  type DevlandNewCodesSessionResult,
  type DevlandRunCommandResult,
} from '@devlandapp/sdk';
import { z } from 'zod';

const devland = createDevlandClient();
const devlandWithOptionalContextSubscription = devland as typeof devland & {
  subscribeToContext?: (listener: (context: DevlandHostContext) => void) => () => void;
};

export const newCodesSession = async (prompt: string): Promise<DevlandNewCodesSessionResult> =>
  await devland.newCodesSession(prompt);

export const getExtensionContext = async (): Promise<DevlandHostContext> =>
  await devland.getContext();

export const subscribeToExtensionContext = (
  listener: (context: DevlandHostContext) => void,
): (() => void) => devlandWithOptionalContextSubscription.subscribeToContext?.(listener) ?? (() => {});

const getCommandErrorMessage = (
  command: string,
  result: DevlandRunCommandResult,
): string => {
  const detail = result.stderr.trim() || result.stdout.trim();

  return detail || `Command "${command}" failed with exit code ${result.exitCode}.`;
};

const runCommand = async (input: {
  command: string;
  args: string[];
  cwd?: string | null;
}): Promise<string> => {
  const result = await devland.runCommand(input);

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
