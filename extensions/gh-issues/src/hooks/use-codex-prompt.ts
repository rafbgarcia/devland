import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const DEFAULT_CODEX_PROMPT = `1. Use gh CLI to review the Github issue
2. Investigate the codebase to verify its relevance
3. Provide your recommended course of action`;

const promptAtom = atomWithStorage('gh-issues:codex-prompt', DEFAULT_CODEX_PROMPT);

export function useCodexPrompt() {
  return useAtom(promptAtom);
}
