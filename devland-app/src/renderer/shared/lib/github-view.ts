import type { GitHubUser, GitHubUserWithAvatar } from '@/ipc/contracts';

export const getAuthorLogin = (author: GitHubUser | null): string => author?.login ?? 'unknown';

export const getUniqueCommentAuthors = (
  authors: Array<GitHubUserWithAvatar | null>,
): GitHubUserWithAvatar[] => {
  const seen = new Set<string>();
  const result: GitHubUserWithAvatar[] = [];

  for (const author of authors) {
    if (author && !seen.has(author.login)) {
      seen.add(author.login);
      result.push(author);
    }
  }

  return result;
};
