import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  PrReviewSchema,
  PrReviewStepSchema,
  type PrReview,
} from '../../ipc/contracts';
import { runCodexStructuredOutput } from '../codex-cli';
import { z } from 'zod';

const execFileAsync = promisify(execFile);

const PrReviewCodexOutputSchema = z.object({
  steps: z.array(PrReviewStepSchema),
});

const PrReviewMetadataSchema = z.object({
  title: z.string().min(1),
  body: z.string(),
  headRefName: z.string().min(1),
  baseRefName: z.string().min(1),
});

const getGhExecOptions = () => ({
  env: {
    ...process.env,
    GH_PROMPT_DISABLED: '1',
  },
  timeout: 30000,
  windowsHide: true,
});

const splitDiffByFile = (rawDiff: string): Record<string, string> => {
  const fileDiffs: Record<string, string> = {};
  const fileSections = rawDiff.split(/^(?=diff --git )/m);

  for (const section of fileSections) {
    if (!section.startsWith('diff --git ')) {
      continue;
    }

    const headerMatch = section.match(/^diff --git a\/.+ b\/(.+)$/m);

    if (!headerMatch) {
      continue;
    }

    fileDiffs[headerMatch[1]!] = section;
  }

  return fileDiffs;
};

const buildReviewPrompt = ({
  title,
  body,
  headRefName,
  baseRefName,
}: z.infer<typeof PrReviewMetadataSchema>): string => {
  const prDescription = body.trim();

  return `
Your task is to explain a pull request's code changes.
Focus on grouping logical/user-value changes and explaining in a way that's easy to digest and understand in sequence.
It's often easier to understand when reviews start from an end-user's perspective, API endpoints, jobs/workers entrypoints, etc. Otherwise, start from the most valuable/worth change.

# PR details

Title: ${title}
- Base branch: origin/${baseRefName}
- Head branch: origin/${headRefName}

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
};

const getPrReviewMetadata = async (
  ghExec: string,
  repo: string,
  prNumber: number,
) => {
  const { stdout } = await execFileAsync(
    ghExec,
    [
      'pr',
      'view',
      String(prNumber),
      '--repo',
      repo,
      '--json',
      'title,body,headRefName,baseRefName',
    ],
    getGhExecOptions(),
  );

  return PrReviewMetadataSchema.parse(JSON.parse(stdout.trim()));
};

const getPrRawDiff = async (
  ghExec: string,
  repo: string,
  prNumber: number,
): Promise<string> => {
  const { stdout } = await execFileAsync(
    ghExec,
    ['pr', 'diff', String(prNumber), '--repo', repo],
    {
      ...getGhExecOptions(),
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  return stdout;
};

export async function generatePrReview(
  codexExec: string,
  ghExec: string,
  owner: string,
  name: string,
  prNumber: number,
  repoPath: string,
): Promise<PrReview> {
  const repo = `${owner}/${name}`;
  const startTime = Date.now();
  const rawDiffPromise = getPrRawDiff(ghExec, repo, prNumber);
  const metadata = await getPrReviewMetadata(ghExec, repo, prNumber);
  const prompt = buildReviewPrompt(metadata);

  const reviewOutputPromise = runCodexStructuredOutput(codexExec, {
    cwd: repoPath,
    prompt,
    outputSchema: PrReviewCodexOutputSchema,
  });

  const [rawDiff, reviewOutput] = await Promise.all([
    rawDiffPromise,
    reviewOutputPromise,
  ]);

  return PrReviewSchema.parse({
    steps: [...reviewOutput.steps].sort((a, b) => a.order - b.order),
    fileDiffs: splitDiffByFile(rawDiff),
    durationMs: Date.now() - startTime,
  });
}
