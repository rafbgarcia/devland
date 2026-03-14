import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

import { PrReviewStepSchema, type PrReview } from '../ipc/contracts';
import { z } from 'zod';

const execFileAsync = promisify(execFile);

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
      .map((dir) => path.join(dir, executableName)),
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

const REVIEW_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          order: { type: 'integer' },
          description: { type: 'string' },
          relevantChanges: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['order', 'description', 'relevantChanges'],
      },
    },
  },
  required: ['steps'],
};

function splitDiffByFile(rawDiff: string): Record<string, string> {
  const fileDiffs: Record<string, string> = {};
  const fileSections = rawDiff.split(/^(?=diff --git )/m);

  for (const section of fileSections) {
    if (!section.startsWith('diff --git ')) continue;

    const headerMatch = section.match(/^diff --git a\/.+ b\/(.+)$/m);
    if (!headerMatch) continue;

    const filePath = headerMatch[1]!;
    fileDiffs[filePath] = section;
  }

  return fileDiffs;
}

function buildReviewPrompt(
  title: string,
  body: string,
  headRefName: string,
  baseRefName: string,
): string {
  const prDescription = body.trim();

  return `
Your task is to explain a pull request's code changes.
Focus on grouping logical/user-value changes and explaining in a way that's easy to digest and understand in sequence.
It's often easier to understand when reviews start from an end-user's perspective, API endpoints, jobs/workers entrypoints, etc. Otherwise, start from the most valuable/worth change.

# PR details

Title: ${title}
- Base branch: ${baseRefName}
- Head branch: ${headRefName}

${prDescription ? `Description: ${prDescription}\n` : ''}

# Rules:
- YOU MAY use git readonly operations to inspect the branch, file diffs, commits, etc.
- YOU MAY read the codebase to understand changes just enough to explain the changes
- YOU MUST NOT use git to change branches, checkout files, or any other mutative action
- Whenever possible, parallelize work to finish your task as fast as possible while maintaining correctness and quality response

# Return structured response with a "steps" array where each step has:
- "order": integer used for sorting
- "description": markdown explanation of what this group of changes does and why
- "relevantChanges": array of file references like "src/file.ts:30-45" (line range) or "src/file.ts" (full file)
`;

}

function runCodexExec(
  codexExec: string,
  args: string[],
  prompt: string,
  cwd: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(codexExec, args, {
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
    }, 180000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `Codex exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start Codex: ${err.message}`));
    });
  });
}

export async function generatePrReview(
  codexExec: string,
  ghExec: string,
  owner: string,
  name: string,
  prNumber: number,
  repoPath: string,
): Promise<PrReview> {
  const repo = `${owner}/${name}`;

  // Get PR metadata and diff in parallel
  const [prViewResult, prDiffResult] = await Promise.all([
    execFileAsync(
      ghExec,
      ['pr', 'view', String(prNumber), '--repo', repo, '--json', 'title,body,headRefName,baseRefName'],
      { timeout: 30000, windowsHide: true, env: { ...process.env, GH_PROMPT_DISABLED: '1' } },
    ),
    execFileAsync(
      ghExec,
      ['pr', 'diff', String(prNumber), '--repo', repo],
      { timeout: 30000, windowsHide: true, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: '1' } },
    ),
  ]);

  const prView = JSON.parse(prViewResult.stdout.trim()) as {
    title: string;
    body: string;
    headRefName: string;
    baseRefName: string;
  };

  const rawDiff = prDiffResult.stdout;
  const fileDiffs = splitDiffByFile(rawDiff);

  const prompt = buildReviewPrompt(
    prView.title,
    prView.body,
    `origin/${prView.headRefName}`,
    `origin/${prView.baseRefName}`,
  );

  const tempDir = path.join(tmpdir(), 'devland-reviews');
  mkdirSync(tempDir, { recursive: true });

  const schemaPath = path.join(tempDir, `schema-${prNumber}.json`);
  const outputPath = path.join(tempDir, `output-${prNumber}.json`);

  writeFileSync(schemaPath, JSON.stringify(REVIEW_OUTPUT_SCHEMA));

  const startTime = Date.now();

  // Pipe prompt via stdin (using `-` arg) to avoid shell argument length limits
  await runCodexExec(
    codexExec,
    [
      'exec',
      '--ephemeral',
      '-c', 'model_reasoning_effort="low"',
      '--output-schema', schemaPath,
      '-o', outputPath,
      '-s', 'read-only',
      '-m', 'gpt-5.4',
      '-',
    ],
    prompt,
    repoPath,
  );

  const outputRaw = readFileSync(outputPath, 'utf-8').trim();
  const parsed = JSON.parse(outputRaw);

  const stepsResult = z.object({
    steps: z.array(PrReviewStepSchema),
  }).parse(parsed);

  return {
    steps: stepsResult.steps.sort((a, b) => a.order - b.order),
    fileDiffs,
    durationMs: Date.now() - startTime,
  };
}
