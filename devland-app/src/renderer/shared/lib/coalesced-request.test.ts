import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createCoalescedTaskRunner } from '@/renderer/shared/lib/coalesced-request';

describe('createCoalescedTaskRunner', () => {
  it('coalesces overlapping runs into one trailing rerun', async () => {
    const runner = createCoalescedTaskRunner();
    const started: number[] = [];
    const releaseResolvers: Array<() => void> = [];

    const task = async () => {
      started.push(started.length + 1);

      await new Promise<void>((resolve) => {
        releaseResolvers.push(resolve);
      });
    };

    const firstRun = runner.run(task);
    const secondRun = runner.run(task);
    const thirdRun = runner.run(task);

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(started, [1]);

    const releaseFirstRun = releaseResolvers.shift();
    if (!releaseFirstRun) {
      throw new Error('Expected the first coalesced run to expose a resolver.');
    }
    releaseFirstRun();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(started, [1, 2]);

    const releaseSecondRun = releaseResolvers.shift();
    if (!releaseSecondRun) {
      throw new Error('Expected the trailing coalesced run to expose a resolver.');
    }
    releaseSecondRun();
    await Promise.all([firstRun, secondRun, thirdRun]);

    assert.deepEqual(started, [1, 2]);
  });

  it('starts a fresh run after the queue becomes idle', async () => {
    const runner = createCoalescedTaskRunner();
    const started: number[] = [];

    await runner.run(async () => {
      started.push(1);
    });

    await runner.run(async () => {
      started.push(2);
    });

    assert.deepEqual(started, [1, 2]);
  });
});
