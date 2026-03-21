import { z } from 'zod';

import {
  SuggestGitWorktreeBranchNameResultSchema,
  type SuggestGitWorktreeBranchNameResult,
} from '../../ipc/contracts';
import { runCodexStructuredOutput } from '../codex-cli';
import { resolveGitWorktreeBranchName } from '../git';

const WorktreeBranchNameSuggestionSchema = z.object({
  branchName: z.string().trim().optional().default(''),
});

const buildWorktreeBranchNamePrompt = (promptText: string): string => `
Generate a concise Git branch name for the user's request.

User request:
${promptText}

Rules:
- Return only a short branch name suggestion.
- Do not add a "codex/" prefix.
- Prefer lowercase words separated by hyphens or forward slashes.
- Do not include explanations, punctuation, quotes, or markdown.
`;

export async function resolveSuggestedGitWorktreeBranchName(
  repoPath: string,
  promptText: string,
  suggestBranchName: (prompt: string) => Promise<string>,
): Promise<SuggestGitWorktreeBranchNameResult> {
  const fallbackSource = promptText.trim() || 'update';
  const suggestedBranchName = await suggestBranchName(promptText);
  const branch = await resolveGitWorktreeBranchName(
    repoPath,
    suggestedBranchName,
    fallbackSource,
  );

  return SuggestGitWorktreeBranchNameResultSchema.parse({ branch });
}

export async function suggestGitWorktreeBranchName(
  codexExec: string,
  repoPath: string,
  promptText: string,
): Promise<SuggestGitWorktreeBranchNameResult> {
  return resolveSuggestedGitWorktreeBranchName(
    repoPath,
    promptText,
    async (currentPromptText) => {
      const output = await runCodexStructuredOutput(codexExec, {
        cwd: repoPath,
        prompt: buildWorktreeBranchNamePrompt(currentPromptText),
        outputSchema: WorktreeBranchNameSuggestionSchema,
        model: 'gpt-5.4-mini',
        reasoningEffort: 'low',
        sandboxMode: 'read-only',
        timeoutMs: 60_000,
      });

      return output.branchName;
    },
  );
}
