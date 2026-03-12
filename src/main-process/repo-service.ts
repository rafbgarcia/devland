import type { Repo } from '../ipc/contracts';
import { normalizeRepoInput, resolveGitHubSlugFromProjectPath } from './git';
import { removeRepoPath, reorderRepoPaths, saveRepoPath } from './repo-store';

export const removeRepo = async (repoPath: string): Promise<void> =>
  removeRepoPath(repoPath);

export const reorderRepos = async (orderedPaths: string[]): Promise<void> =>
  reorderRepoPaths(orderedPaths);

export const addRepo = async (candidatePath: string): Promise<Repo> => {
  const projectPath = normalizeRepoInput(candidatePath);

  await resolveGitHubSlugFromProjectPath(projectPath);

  return saveRepoPath(projectPath);
};
