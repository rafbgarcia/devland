import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCollapsedProposedPlanPreviewMarkdown,
  buildPlanImplementationPrompt,
  parseProposedPlanMessage,
  proposedPlanTitle,
  resolvePlanFollowUpSubmission,
  stripDisplayedPlanMarkdown,
} from '@/renderer/code-screen/proposed-plan';

describe('parseProposedPlanMessage', () => {
  it('extracts the proposed plan markdown block and surrounding assistant text', () => {
    assert.deepEqual(
      parseProposedPlanMessage(
        'Here is the plan.\n\n<proposed_plan>\n# Ship plan mode\n\n## Summary\n\n- Add the toggle\n</proposed_plan>\n\nWaiting for feedback.',
      ),
      {
        before: 'Here is the plan.',
        planMarkdown: '# Ship plan mode\n\n## Summary\n\n- Add the toggle',
        after: 'Waiting for feedback.',
      },
    );
  });

  it('returns null when no proposed plan block is present', () => {
    assert.equal(parseProposedPlanMessage('Plain assistant message'), null);
  });
});

describe('proposedPlanTitle', () => {
  it('uses the first markdown heading as the plan title', () => {
    assert.equal(proposedPlanTitle('# Integrate planning mode\n\nBody'), 'Integrate planning mode');
  });

  it('returns null when no heading exists', () => {
    assert.equal(proposedPlanTitle('- step 1'), null);
  });
});

describe('stripDisplayedPlanMarkdown', () => {
  it('drops the title and redundant summary heading from rendered plan markdown', () => {
    assert.equal(
      stripDisplayedPlanMarkdown('# Integrate planning mode\n\n## Summary\n\n- step 1'),
      '- step 1',
    );
  });
});

describe('buildCollapsedProposedPlanPreviewMarkdown', () => {
  it('truncates long plan previews cleanly', () => {
    assert.equal(
      buildCollapsedProposedPlanPreviewMarkdown(
        '# Integrate planning mode\n\n- step 1\n- step 2\n- step 3',
        { maxLines: 2 },
      ),
      '- step 1\n- step 2\n\n...',
    );
  });
});

describe('buildPlanImplementationPrompt', () => {
  it('formats the approved plan handoff prompt', () => {
    assert.equal(
      buildPlanImplementationPrompt('## Ship it\n\n- step 1\n'),
      'PLEASE IMPLEMENT THIS PLAN:\n## Ship it\n\n- step 1',
    );
  });
});

describe('resolvePlanFollowUpSubmission', () => {
  it('switches to default mode when implementing the accepted plan without extra text', () => {
    assert.deepEqual(
      resolvePlanFollowUpSubmission({
        draftText: '   ',
        planMarkdown: '## Ship it\n\n- step 1\n',
      }),
      {
        text: 'PLEASE IMPLEMENT THIS PLAN:\n## Ship it\n\n- step 1',
        interactionMode: 'default',
      },
    );
  });

  it('stays in plan mode when the user adds a follow-up request', () => {
    assert.deepEqual(
      resolvePlanFollowUpSubmission({
        draftText: 'Revise step 2 to avoid a new dependency.',
        planMarkdown: '## Ship it\n\n- step 1\n',
      }),
      {
        text: 'Revise step 2 to avoid a new dependency.',
        interactionMode: 'plan',
      },
    );
  });
});
