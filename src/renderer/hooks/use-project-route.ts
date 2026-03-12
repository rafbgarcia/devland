import { getRouteApi } from '@tanstack/react-router';

import type { Repo } from '@/ipc/contracts';
import { useAppBootstrap } from '@/renderer/hooks/use-app-bootstrap';

const projectRouteApi = getRouteApi('/projects/$repoId');

export const useProjectRoute = (): {
  repoId: string;
  repos: Repo[];
  activeRepo: Repo | null;
} => {
  const { repos } = useAppBootstrap();
  const { repoId } = projectRouteApi.useParams();
  const activeRepo = repos.find((repo) => repo.id === repoId) ?? null;

  return {
    repoId,
    repos,
    activeRepo,
  };
};
