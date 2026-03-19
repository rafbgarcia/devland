import { GhUserSchema, type GhUser } from '../../ipc/contracts';
import { gh } from '../gh-cli';

export const getGhUser = async (): Promise<GhUser | null> => {
  if (gh === null) {
    return null;
  }

  try {
    return GhUserSchema.parse(await gh(['api', 'user']));
  } catch {
    return null;
  }
};
