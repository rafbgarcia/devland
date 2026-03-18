import type {
  CommitWorkingTreeSelectionInput,
  CommitWorkingTreeSelectionResult,
} from '@/ipc/contracts';
import { requestGitStatusRefresh } from '@/renderer/shared/lib/git-status-refresh';

export async function commitWorkingTreeSelectionAndRefresh(
  input: CommitWorkingTreeSelectionInput,
): Promise<CommitWorkingTreeSelectionResult> {
  const result = await window.electronAPI.commitWorkingTreeSelection(input);

  requestGitStatusRefresh({
    repoPath: input.repoPath,
    reason: 'git-operation',
  });

  return result;
}
