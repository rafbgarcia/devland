import { ghWithResponse } from './gh-cli';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const GH_CACHE_TTL = `${CACHE_TTL_MS / 1000}s`;
const REQUEST_BURST_WINDOW_MS = 1500;
const MAX_IDENTICAL_REQUESTS_PER_WINDOW = 4;

type GraphQLVariables = Record<string, string | number | boolean>;
export type GraphqlResult<T> = {
  data: T;
  fetchedAt: number;
};

const inFlightRequests = new Map<string, Promise<GraphqlResult<unknown>>>();
const requestTimestampsByKey = new Map<string, number[]>();

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

const getRequestKey = (
  query: string,
  {
    owner,
    name,
    skipCache,
    variables,
  }: {
    owner: string;
    name: string;
    skipCache: boolean;
    variables: GraphQLVariables | undefined;
  },
): string =>
  JSON.stringify({
    query,
    owner,
    name,
    skipCache,
    variables:
      variables === undefined
        ? null
        : Object.fromEntries(
            Object.entries(variables).sort(([left], [right]) =>
              left.localeCompare(right),
            ),
          ),
  });

const assertRequestBurstLimit = (requestKey: string): void => {
  const now = Date.now();
  const recentTimestamps = (
    requestTimestampsByKey.get(requestKey) ?? []
  ).filter((timestamp) => now - timestamp < REQUEST_BURST_WINDOW_MS);

  if (recentTimestamps.length >= MAX_IDENTICAL_REQUESTS_PER_WINDOW) {
    throw new Error(
      'GitHub request burst guard triggered. Too many identical GraphQL requests were started in a short window.',
    );
  }

  recentTimestamps.push(now);
  requestTimestampsByKey.set(requestKey, recentTimestamps);
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

  const requestKey = getRequestKey(query, {
    owner,
    name,
    skipCache,
    variables,
  });
  const inFlightRequest = inFlightRequests.get(requestKey);

  if (inFlightRequest !== undefined) {
    return inFlightRequest as Promise<GraphqlResult<T>>;
  }

  assertRequestBurstLimit(requestKey);

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

  const request = ghWithResponse<T>(args)
    .then((response) => ({
      data: response.body,
      fetchedAt: getFetchedAtFromHeaders(response.headers),
    }))
    .finally(() => {
      inFlightRequests.delete(requestKey);
    });

  inFlightRequests.set(requestKey, request as Promise<GraphqlResult<unknown>>);

  return request;
}
