import {
  CreateGitHubPrReviewThreadInputSchema,
  CreateGitHubPrReviewThreadResultSchema,
  type CreateGitHubPrReviewThreadInput,
  type CreateGitHubPrReviewThreadResult,
} from '@/ipc/contracts';
import { gh } from '@/main-process/gh-cli';

const PULL_REQUEST_REVIEW_INFO_QUERY = `
query PullRequestReviewInfo($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      viewerLatestReview {
        id
        state
      }
    }
  }
}
`;

const ADD_PULL_REQUEST_REVIEW_MUTATION = `
mutation AddPullRequestReview(
  $pullRequestId: ID!
  $path: String!
  $body: String!
  $line: Int!
  $side: DiffSide!
  $startLine: Int
  $startSide: DiffSide
) {
  addPullRequestReview(
    input: {
      pullRequestId: $pullRequestId
      threads: [{
        path: $path
        body: $body
        line: $line
        side: $side
        startLine: $startLine
        startSide: $startSide
      }]
    }
  ) {
    pullRequestReview {
      id
      state
    }
  }
}
`;

const ADD_PULL_REQUEST_REVIEW_THREAD_MUTATION = `
mutation AddPullRequestReviewThread(
  $pullRequestReviewId: ID!
  $path: String!
  $body: String!
  $line: Int!
  $side: DiffSide!
  $startLine: Int
  $startSide: DiffSide
) {
  addPullRequestReviewThread(
    input: {
      pullRequestReviewId: $pullRequestReviewId
      path: $path
      body: $body
      line: $line
      side: $side
      startLine: $startLine
      startSide: $startSide
    }
  ) {
    pullRequestReview {
      id
    }
  }
}
`;

type PullRequestReviewInfoResponse = {
  data: {
    repository: {
      pullRequest: {
        id: string;
        viewerLatestReview: {
          id: string;
          state: string;
        } | null;
      } | null;
    } | null;
  };
};

type AddPullRequestReviewResponse = {
  data: {
    addPullRequestReview: {
      pullRequestReview: {
        id: string;
        state: string;
      };
    } | null;
  };
};

type AddPullRequestReviewThreadResponse = {
  data: {
    addPullRequestReviewThread: {
      pullRequestReview: {
        id: string;
      };
    } | null;
  };
};

function buildGraphQlArgs(
  query: string,
  variables: Record<string, string | number>,
) {
  const args = ['api', 'graphql', '-f', `query=${query}`];

  for (const [key, value] of Object.entries(variables)) {
    args.push(typeof value === 'number' ? '-F' : '-f', `${key}=${String(value)}`);
  }

  return args;
}

function getThreadVariables(input: CreateGitHubPrReviewThreadInput) {
  return {
    path: input.path,
    body: input.body,
    line: input.line,
    side: input.side,
    ...(input.startLine ? { startLine: input.startLine } : {}),
    ...(input.startSide ? { startSide: input.startSide } : {}),
  };
}

export async function createGitHubPrReviewThread(
  input: CreateGitHubPrReviewThreadInput,
): Promise<CreateGitHubPrReviewThreadResult> {
  const parsedInput = CreateGitHubPrReviewThreadInputSchema.parse(input);

  if (gh === null) {
    throw new Error('GitHub CLI is not available on this machine.');
  }

  const pullRequestInfo = await gh<PullRequestReviewInfoResponse>(
    buildGraphQlArgs(PULL_REQUEST_REVIEW_INFO_QUERY, {
      owner: parsedInput.owner,
      name: parsedInput.name,
      number: parsedInput.prNumber,
    }),
  );
  const pullRequest = pullRequestInfo.data.repository?.pullRequest;

  if (!pullRequest) {
    throw new Error(`Pull request #${parsedInput.prNumber} was not found.`);
  }

  const pendingReview = pullRequest.viewerLatestReview?.state === 'PENDING'
    ? pullRequest.viewerLatestReview
    : null;

  if (pendingReview) {
    const response = await gh<AddPullRequestReviewThreadResponse>(
      buildGraphQlArgs(ADD_PULL_REQUEST_REVIEW_THREAD_MUTATION, {
        pullRequestReviewId: pendingReview.id,
        ...getThreadVariables(parsedInput),
      }),
    );
    const reviewId = response.data.addPullRequestReviewThread?.pullRequestReview.id;

    if (!reviewId) {
      throw new Error('GitHub did not return the pending review after adding the thread.');
    }

    return CreateGitHubPrReviewThreadResultSchema.parse({ reviewId });
  }

  const response = await gh<AddPullRequestReviewResponse>(
    buildGraphQlArgs(ADD_PULL_REQUEST_REVIEW_MUTATION, {
      pullRequestId: pullRequest.id,
      ...getThreadVariables(parsedInput),
    }),
  );
  const reviewId = response.data.addPullRequestReview?.pullRequestReview.id;

  if (!reviewId) {
    throw new Error('GitHub did not return the created draft review.');
  }

  return CreateGitHubPrReviewThreadResultSchema.parse({ reviewId });
}
