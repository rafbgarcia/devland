import type { GitHubUser } from '@/ipc/contracts';

export const getAuthorLogin = (author: GitHubUser | null): string => author?.login ?? 'unknown';

export const getUniqueCommentAuthorLogins = (
  authors: Array<GitHubUser | null>,
): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const author of authors) {
    const login = author?.login;

    if (login && !seen.has(login)) {
      seen.add(login);
      result.push(login);
    }
  }

  return result;
};
