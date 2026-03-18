import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import type {
  CommitWorkingTreeSelectionInput,
  ElectronApi,
} from '@/ipc/contracts';
import { commitWorkingTreeSelectionAndRefresh } from '@/renderer/code-screen/working-tree-commit';
import { subscribeToGitStatusRefresh } from '@/renderer/shared/lib/git-status-refresh';

const commitInput: CommitWorkingTreeSelectionInput = {
  repoPath: '/tmp/repo',
  summary: 'Add commit refresh',
  description: '',
  files: [
    {
      path: 'src/example.ts',
      paths: ['src/example.ts'],
      kind: 'full',
    },
  ],
};

const testGlobal = globalThis as unknown as { window?: unknown };
const originalWindow = testGlobal.window;

function createElectronApiMock(
  electronAPI: Pick<ElectronApi, 'commitWorkingTreeSelection'>,
): ElectronApi {
  return electronAPI as ElectronApi;
}

afterEach(() => {
  if (originalWindow === undefined) {
    delete testGlobal.window;
    return;
  }

  testGlobal.window = originalWindow;
});

describe('commitWorkingTreeSelectionAndRefresh', () => {
  it('requests a git refresh after a successful commit', async () => {
    const refreshRequests: unknown[] = [];
    const unsubscribe = subscribeToGitStatusRefresh((request) => {
      refreshRequests.push(request);
    });

    testGlobal.window = {
      electronAPI: createElectronApiMock({
        commitWorkingTreeSelection: async () => ({ commitSha: 'abc1234' }),
      }),
    };

    try {
      const result = await commitWorkingTreeSelectionAndRefresh(commitInput);

      assert.deepEqual(result, { commitSha: 'abc1234' });
      assert.deepEqual(refreshRequests, [
        {
          repoPath: '/tmp/repo',
          reason: 'git-operation',
        },
      ]);
    } finally {
      unsubscribe();
    }
  });

  it('does not request a git refresh when the commit fails', async () => {
    const refreshRequests: unknown[] = [];
    const unsubscribe = subscribeToGitStatusRefresh((request) => {
      refreshRequests.push(request);
    });

    testGlobal.window = {
      electronAPI: createElectronApiMock({
        commitWorkingTreeSelection: async () => {
          throw new Error('Commit failed.');
        },
      }),
    };

    try {
      await assert.rejects(
        commitWorkingTreeSelectionAndRefresh(commitInput),
        /Commit failed\./,
      );
      assert.deepEqual(refreshRequests, []);
    } finally {
      unsubscribe();
    }
  });
});
