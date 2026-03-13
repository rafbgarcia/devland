import { z } from 'zod';

import type { GhUser } from '../../ipc/contracts';
import { gh } from '../gh-cli';

const GhUserSchema: z.ZodType<GhUser> = z.object({
  login: z.string().min(1),
});

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
