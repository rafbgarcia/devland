import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { renderToStaticMarkup } from 'react-dom/server';

import { renderHighlightedText } from '@/renderer/shared/ui/diff/render-highlighted-text';

describe('renderHighlightedText', () => {
  it('merges syntax token styles with diff overlay classes', () => {
    const markup = renderToStaticMarkup(
      <div>
        {renderHighlightedText('const', [
          {
            0: {
              length: 5,
              token: 'diff-syntax-token',
              htmlStyle: {
                color: '#111111',
              },
            },
          },
          {
            1: {
              length: 3,
              token: 'diff-add-inner',
            },
          },
        ])}
      </div>,
    );

    assert.match(markup, /cm-diff-syntax-token/);
    assert.match(markup, /cm-diff-add-inner/);
    assert.match(markup, /color:#111111/);
  });
});
