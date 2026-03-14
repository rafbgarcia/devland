import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { z } from 'zod';

const CODEX_COMMON_PATHS: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: ['/opt/homebrew/bin/codex', '/usr/local/bin/codex'],
  linux: ['/usr/bin/codex', '/usr/local/bin/codex'],
};

const resolveCodexExecutable = (): string | null => {
  const executableName = 'codex';
  const pathValue = process.env.PATH ?? '';
  const candidates = [
    ...pathValue
      .split(path.delimiter)
      .filter(Boolean)
      .map((directory) => path.join(directory, executableName)),
    ...(CODEX_COMMON_PATHS[process.platform] ?? []),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

export const codexExecutable = resolveCodexExecutable();

type RunCodexStructuredOutputOptions<T> = {
  cwd: string;
  prompt: string;
  outputSchema: z.ZodType<T>;
  model?: string;
  reasoningEffort?: string;
  sandboxMode?: string;
  timeoutMs?: number;
};

const runCodexExec = (
  codexExec: string,
  args: readonly string[],
  prompt: string,
  cwd: string,
  timeoutMs: number,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const proc = spawn(codexExec, [...args], {
      cwd,
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'pipe'],
    });

    let stderr = '';
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.stdin.write(prompt);
    proc.stdin.end();

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Codex review timed out after 3 minutes.'));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `Codex exited with code ${code}`));
    });

    proc.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start Codex: ${error.message}`));
    });
  });

export const runCodexStructuredOutput = async <T>(
  codexExec: string,
  {
    cwd,
    prompt,
    outputSchema,
    model = 'gpt-5.4',
    reasoningEffort = 'low',
    sandboxMode = 'read-only',
    timeoutMs = 180000,
  }: RunCodexStructuredOutputOptions<T>,
): Promise<T> => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'devland-codex-'));
  const schemaPath = path.join(tempDir, 'output-schema.json');
  const outputPath = path.join(tempDir, 'output.json');

  try {
    writeFileSync(schemaPath, JSON.stringify(z.toJSONSchema(outputSchema)));

    await runCodexExec(
      codexExec,
      [
        'exec',
        '--ephemeral',
        '-c', `model_reasoning_effort="${reasoningEffort}"`,
        '--output-schema', schemaPath,
        '-o', outputPath,
        '-s', sandboxMode,
        '-m', model,
        '-',
      ],
      prompt,
      cwd,
      timeoutMs,
    );

    const outputRaw = readFileSync(outputPath, 'utf-8').trim();

    return outputSchema.parse(JSON.parse(outputRaw));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};
