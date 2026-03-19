import {
  PrReviewSchema,
  PrReviewStepSchema,
  type PrReview,
} from '../../ipc/contracts';
import { runCodexStructuredOutput } from '../codex-cli';
import { getPrDiff, getPrDiffMeta, splitDiffByFile } from '../git';
import { z } from 'zod';

const PrReviewCodexOutputSchema = z.object({
  steps: z.array(PrReviewStepSchema),
});

const PrReviewPromptMetadataSchema = z.object({
  prNumber: z.number().int().positive(),
  title: z.string().min(1),
  headRefName: z.string().min(1),
  baseRefName: z.string().min(1),
});

const buildReviewPrompt = ({
  prNumber,
  title,
  headRefName,
  baseRefName,
}: z.infer<typeof PrReviewPromptMetadataSchema>): string => {
  return `
Your task is to explain a pull request's code changes.
Focus on grouping logical/user-value changes and explaining in a way that's easy to digest and understand in sequence.
It's often easier to understand when reviews start from an end-user's perspective, API endpoints, jobs/workers entrypoints, etc. Otherwise, start from the most valuable/worth change.

# PR details

Title: ${title}
- Base snapshot: refs/remotes/origin/${baseRefName}
- Head snapshot: refs/devland/pr/${prNumber}/head (${headRefName})

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

export async function generatePrReview(
  codexExec: string,
  repoPath: string,
  prNumber: number,
  title: string,
): Promise<PrReview> {
  const startTime = Date.now();
  const localMeta = await getPrDiffMeta(repoPath, prNumber);

  if (localMeta.status !== 'ready') {
    throw new Error('No local PR snapshot is available yet.');
  }

  const prompt = buildReviewPrompt(
    PrReviewPromptMetadataSchema.parse({
      prNumber,
      title,
      baseRefName: localMeta.baseBranch,
      headRefName: localMeta.headBranch,
    }),
  );

  const reviewOutputPromise = runCodexStructuredOutput(codexExec, {
    cwd: repoPath,
    prompt,
    outputSchema: PrReviewCodexOutputSchema,
  });

  const [rawDiff, reviewOutput] = await Promise.all([
    getPrDiff(repoPath, prNumber),
    reviewOutputPromise,
  ]);

  return PrReviewSchema.parse({
    steps: [...reviewOutput.steps].sort((a, b) => a.order - b.order),
    fileDiffs: splitDiffByFile(rawDiff),
    durationMs: Date.now() - startTime,
  });
}
