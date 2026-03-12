import type { Repo } from '../ipc/contracts';
import { normalizeRepoInput, resolveGitHubSlugFromProjectPath } from './git';
import { saveRepoPath } from './repo-store';

export const addRepo = async (candidatePath: string): Promise<Repo> => {
  const projectPath = normalizeRepoInput(candidatePath);

  await resolveGitHubSlugFromProjectPath(projectPath);

  return saveRepoPath(projectPath);
};
