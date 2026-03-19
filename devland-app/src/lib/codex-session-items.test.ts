import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatCodexActivityLabel,
  isToolLifecycleItemType,
  toCodexActivityItemType,
} from '@/lib/codex-session-items';

describe('toCodexActivityItemType', () => {
  it('normalizes non-tool lifecycle item types', () => {
    assert.equal(toCodexActivityItemType('userMessage'), 'user_message');
    assert.equal(toCodexActivityItemType('agentMessage'), 'assistant_message');
    assert.equal(toCodexActivityItemType('reasoning'), 'reasoning');
    assert.equal(toCodexActivityItemType('todo'), 'plan');
  });

  it('normalizes tool lifecycle item types', () => {
    assert.equal(toCodexActivityItemType('commandExecution'), 'command_execution');
    assert.equal(toCodexActivityItemType('fileChange'), 'file_change');
    assert.equal(toCodexActivityItemType('webSearch'), 'web_search');
    assert.equal(toCodexActivityItemType('mcp_tool_call'), 'mcp_tool_call');
  });

  it('falls back to unknown for unrecognized item types', () => {
    assert.equal(toCodexActivityItemType('somethingUnexpected'), 'unknown');
  });
});

describe('isToolLifecycleItemType', () => {
  it('returns true for tool lifecycle item types', () => {
    assert.equal(isToolLifecycleItemType('command_execution'), true);
    assert.equal(isToolLifecycleItemType('image_view'), true);
  });

  it('returns false for non-tool item types', () => {
    assert.equal(isToolLifecycleItemType('assistant_message'), false);
    assert.equal(isToolLifecycleItemType('reasoning'), false);
    assert.equal(isToolLifecycleItemType('unknown'), false);
    assert.equal(isToolLifecycleItemType(null), false);
  });
});

describe('formatCodexActivityLabel', () => {
  it('returns explicit titles when present', () => {
    assert.equal(
      formatCodexActivityLabel({
        itemType: 'mcp_tool_call',
        title: 'Read repository metadata',
      }),
      'Read repository metadata',
    );
  });

  it('falls back to sensible labels for known activity types', () => {
    assert.equal(
      formatCodexActivityLabel({
        itemType: 'command_execution',
      }),
      'Run command',
    );
    assert.equal(
      formatCodexActivityLabel({
        itemType: 'file_change',
      }),
      'Edit files',
    );
  });
});
