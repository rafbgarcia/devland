import { z } from 'zod';

import {
  SuggestCodexSessionNamingResultSchema,
  type SuggestCodexSessionNamingResult,
} from '../../ipc/contracts';
import { runCodexStructuredOutput } from '../codex-cli';
import { resolveGitWorktreeBranchName } from '../git';

const CodexSessionNameSuggestionSchema = z.object({
  threadName: z.string().trim().optional().default(''),
});

const MAX_THREAD_NAME_LENGTH = 80;

const buildCodexSessionNamePrompt = (promptText: string): string => `
Generate a concise session title for the user's request.

User request:
${promptText}

Rules:
- Return only a short human-readable title.
- Prefer 2 to 6 words when possible.
- Do not include quotes, markdown, or explanations.
- Use plain text with normal capitalization.
`;

export function normalizeCodexThreadNameCandidate(value: string): string {
  const firstLine = value
    .trim()
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? '';

  return firstLine
    .replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_THREAD_NAME_LENGTH);
}

export function buildFallbackCodexThreadName(value: string): string {
  return normalizeCodexThreadNameCandidate(value) || 'Update';
}

export async function resolveSuggestedCodexSessionNaming(
  repoPath: string,
  promptText: string,
  suggestThreadName: (prompt: string) => Promise<string>,
): Promise<SuggestCodexSessionNamingResult> {
  const fallbackSource = promptText.trim() || 'Update';
  const suggestedThreadName = await suggestThreadName(promptText);
  const threadName =
    normalizeCodexThreadNameCandidate(suggestedThreadName) ||
    buildFallbackCodexThreadName(fallbackSource);
  const branchName = await resolveGitWorktreeBranchName(
    repoPath,
    threadName,
    threadName,
  );

  return SuggestCodexSessionNamingResultSchema.parse({
    threadName,
    branchName,
  });
}

export async function suggestCodexSessionNaming(
  codexExec: string,
  repoPath: string,
  promptText: string,
): Promise<SuggestCodexSessionNamingResult> {
  return resolveSuggestedCodexSessionNaming(
    repoPath,
    promptText,
    async (currentPromptText) => {
      const output = await runCodexStructuredOutput(codexExec, {
        cwd: repoPath,
        prompt: buildCodexSessionNamePrompt(currentPromptText),
        outputSchema: CodexSessionNameSuggestionSchema,
        model: 'gpt-5.3-codex-spark',
        reasoningEffort: 'low',
        sandboxMode: 'read-only',
        timeoutMs: 30_000,
      });

      return output.threadName;
    },
  );
}
