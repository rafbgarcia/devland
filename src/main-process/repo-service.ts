import type { Repo } from '../ipc/contracts';
import { normalizeRepoInput, resolveGitHubSlugFromProjectPath } from './git';
import { removeRepoById, reorderRepoIds, saveRepoPath } from './repo-store';

export const removeRepo = async (repoId: string): Promise<void> =>
  removeRepoById(repoId);

export const reorderRepos = async (orderedRepoIds: string[]): Promise<void> =>
  reorderRepoIds(orderedRepoIds);

export const addRepo = async (candidatePath: string): Promise<Repo> => {
  const projectPath = normalizeRepoInput(candidatePath);

  await resolveGitHubSlugFromProjectPath(projectPath);

  return saveRepoPath(projectPath);
};
