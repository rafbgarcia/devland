import type { GitHubUserWithAvatar } from '@/pull-requests/contracts';

export const getAuthorLogin = (author: { login: string } | null): string => author?.login ?? 'unknown';

export const getUniqueCommentAuthors = (
  authors: Array<GitHubUserWithAvatar | null>,
): GitHubUserWithAvatar[] => {
  const seen = new Set<string>();
  const result: GitHubUserWithAvatar[] = [];

  for (const author of authors) {
    if (author !== null && !seen.has(author.login)) {
      seen.add(author.login);
      result.push(author);
    }
  }

  return result;
};
