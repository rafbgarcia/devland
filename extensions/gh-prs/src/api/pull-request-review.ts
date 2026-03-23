import type { DevlandRepoContext } from '@devlandapp/sdk';
import { z } from 'zod';

import { runCommandResult, runJsonCommand } from '@/lib/devland';
import {
  PullRequestReviewSchema,
  PromptRequestNoteSchema,
  type PullRequestReview,
  type PromptRequestNote,
} from '@/types/review';

const PullRequestReviewResponseSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        number: z.number().int().positive(),
        title: z.string().min(1),
        url: z.string().url(),
        commits: z.object({
          nodes: z.array(z.object({
            commit: z.object({
              oid: z.string().min(1),
              abbreviatedOid: z.string().min(1),
              messageHeadline: z.string().min(1),
              committedDate: z.string().min(1),
              url: z.string().url(),
              author: z.object({
                name: z.string().nullable(),
                user: z.object({
                  login: z.string().min(1),
                }).nullable(),
              }).nullable(),
            }),
          })),
        }),
      }),
    }),
  }),
});

function buildPullRequestReviewQueryArgs(owner: string, name: string, number: number): string[] {
  return [
    'api',
    'graphql',
    '-f',
    `query=${PULL_REQUEST_REVIEW_QUERY}`,
    '-F',
    `owner=${owner}`,
    '-F',
    `name=${name}`,
    '-F',
    `number=${number}`,
  ];
}

function isMissingPromptRequestNote(stderr: string): boolean {
  return /no note found for object|failed to resolve|unknown revision|bad object/i.test(stderr);
}

async function readPromptRequestNote(
  repoPath: string,
  commitSha: string,
): Promise<PromptRequestNote | null> {
  const result = await runCommandResult({
    command: 'git',
    args: ['-C', repoPath, 'notes', '--ref=devland-prompt-requests', 'show', commitSha],
    cwd: repoPath,
  });

  if (result.exitCode !== 0) {
    if (isMissingPromptRequestNote(result.stderr)) {
      return null;
    }

    throw new Error(result.stderr.trim() || `Could not read prompt request note for ${commitSha}.`);
  }

  let parsedOutput: unknown;

  try {
    parsedOutput = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Prompt request note for ${commitSha} is not valid JSON.`);
  }

  return PromptRequestNoteSchema.parse(parsedOutput);
}

export async function getPullRequestReview(
  repo: Pick<DevlandRepoContext, 'owner' | 'name' | 'projectPath' | 'isLocal'>,
  number: number,
): Promise<PullRequestReview> {
  const response = await runJsonCommand(
    {
      command: 'gh',
      args: buildPullRequestReviewQueryArgs(repo.owner, repo.name, number),
    },
    PullRequestReviewResponseSchema,
  );

  const pullRequest = response.data.repository.pullRequest;
  const commits = await Promise.all(
    pullRequest.commits.nodes.map(async ({ commit }) => ({
      sha: commit.oid,
      shortSha: commit.abbreviatedOid,
      messageHeadline: commit.messageHeadline,
      committedAt: commit.committedDate,
      authorName: commit.author?.user?.login ?? commit.author?.name ?? null,
      url: commit.url,
      note: repo.isLocal
        ? await readPromptRequestNote(repo.projectPath, commit.oid)
        : null,
    })),
  );

  return PullRequestReviewSchema.parse({
    number: pullRequest.number,
    title: pullRequest.title,
    url: pullRequest.url,
    commits,
  });
}

const PULL_REQUEST_REVIEW_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      number
      title
      url
      commits(first: 100) {
        nodes {
          commit {
            oid
            abbreviatedOid
            messageHeadline
            committedDate
            url
            author {
              name
              user {
                login
              }
            }
          }
        }
      }
    }
  }
}
`.replace(/\n\s*/g, ' ').trim();
