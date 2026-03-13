import { ghWithResponse } from './gh-cli';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const GH_CACHE_TTL = `${CACHE_TTL_MS / 1000}s`;

type GraphQLVariables = Record<string, string | number | boolean>;
export type GraphqlResult<T> = {
  data: T;
  fetchedAt: number;
};

const getFetchedAtFromHeaders = (headers: Record<string, string>): number => {
  const dateHeader = headers.date;

  if (!dateHeader) {
    throw new Error('GitHub response is missing the Date header.');
  }

  const fetchedAt = Date.parse(dateHeader);

  if (Number.isNaN(fetchedAt)) {
    throw new Error(`GitHub response Date header is invalid: ${dateHeader}`);
  }

  return fetchedAt;
};

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
): Promise<GraphqlResult<T>> {
  if (ghWithResponse === null) {
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

  const response = await ghWithResponse<T>(args);

  return {
    data: response.body,
    fetchedAt: getFetchedAtFromHeaders(response.headers),
  };
}
