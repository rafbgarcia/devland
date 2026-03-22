import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';

import {
  ChatContextWindowIndicator,
  deriveChatContextWindowIndicatorState,
} from '@/renderer/code-screen/chat-context-window-indicator';

describe('deriveChatContextWindowIndicatorState', () => {
  it('derives percentage and compact token labels from the latest turn usage', () => {
    const state = deriveChatContextWindowIndicatorState({
      last: {
        cachedInputTokens: 200,
        inputTokens: 8_000,
        outputTokens: 600,
        reasoningOutputTokens: 300,
        totalTokens: 8_600,
      },
      total: {
        cachedInputTokens: 900,
        inputTokens: 74_000,
        outputTokens: 1_100,
        reasoningOutputTokens: 700,
        totalTokens: 75_000,
      },
      modelContextWindow: 258_000,
    });

    assert.ok(state);
    assert.equal(state.ariaLabel, '3% of the Codex context window used');
    assert.equal(state.maxTokens, 258_000);
    assert.equal(state.usedTokens, 8_600);
    assert.equal(state.usedTokensLabel, '8.6k');
    assert.equal(state.maxTokensLabel, '258k');
    assert.equal(Math.round(state.percentUsed), 3);
    assert.equal(Math.round(state.percentLeft), 97);
    assert.equal(state.severity, 'low');
    assert.ok(state.progressOffset > 0);
  });
});

describe('ChatContextWindowIndicator', () => {
  it('renders an accessible trigger when usage is available', () => {
    const markup = renderToStaticMarkup(
      <ChatContextWindowIndicator
        tokenUsage={{
          last: {
            cachedInputTokens: 20,
            inputTokens: 11_500,
            outputTokens: 350,
            reasoningOutputTokens: 150,
            totalTokens: 12_000,
          },
          total: {
            cachedInputTokens: 80,
            inputTokens: 36_000,
            outputTokens: 1_200,
            reasoningOutputTokens: 600,
            totalTokens: 37_200,
          },
          modelContextWindow: 258_000,
        }}
      />,
    );

    assert.match(markup, /aria-label="5% of the Codex context window used"/);
    assert.match(markup, /<svg/);
  });
});
