import { gh } from './gh-cli';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const GH_CACHE_TTL = `${CACHE_TTL_MS / 1000}s`;

type GraphQLVariables = Record<string, string | number | boolean>;

export async function graphql<T = unknown>(
  query: string,
  {
    owner,
    name,
    skipCache = false,
    variables,
  }: {
    owner: string;
    name: string;
    skipCache?: boolean;
    variables?: GraphQLVariables;
  },
): Promise<T> {
  if (gh === null) {
    throw new Error('GitHub CLI is not installed or could not be found.');
  }

  const args = ['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`];

  if (!skipCache) {
    args.splice(2, 0, '--cache', GH_CACHE_TTL);
  }

  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      const flag = typeof value === 'string' ? '-f' : '-F';
      args.push(flag, `${key}=${String(value)}`);
    }
  }

  return gh<T>(args);
}
