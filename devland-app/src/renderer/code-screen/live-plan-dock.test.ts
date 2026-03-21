import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getFocusPlanStep } from '@/renderer/code-screen/live-plan-dock';

describe('getFocusPlanStep', () => {
  it('prefers the in-progress task for minimized display', () => {
    assert.deepEqual(
      getFocusPlanStep([
        { step: 'Inspect transport', status: 'completed' },
        { step: 'Render the live dock', status: 'inProgress' },
        { step: 'Verify the animation', status: 'pending' },
      ]),
      { step: 'Render the live dock', status: 'inProgress' },
    );
  });

  it('falls back to the next pending task when nothing is in progress', () => {
    assert.deepEqual(
      getFocusPlanStep([
        { step: 'Inspect transport', status: 'completed' },
        { step: 'Render the live dock', status: 'pending' },
        { step: 'Verify the animation', status: 'pending' },
      ]),
      { step: 'Render the live dock', status: 'pending' },
    );
  });

  it('falls back to the last task when all steps are completed', () => {
    assert.deepEqual(
      getFocusPlanStep([
        { step: 'Inspect transport', status: 'completed' },
        { step: 'Render the live dock', status: 'completed' },
      ]),
      { step: 'Render the live dock', status: 'completed' },
    );
  });
});
