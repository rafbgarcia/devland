import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';

import { devlandMarkdownUrlTransform } from '@/renderer/shared/lib/markdown-url-transform';

describe('devlandMarkdownUrlTransform', () => {
  it('preserves devland codex attachment urls', () => {
    const attachmentUrl = 'devland-codex-attachment://asset/example.png';

    assert.equal(devlandMarkdownUrlTransform(attachmentUrl), attachmentUrl);
  });

  it('renders attachment images with their src intact', () => {
    const markup = renderToStaticMarkup(
      createElement(
        ReactMarkdown,
        { urlTransform: devlandMarkdownUrlTransform },
        '![Browser smoke screenshot](devland-codex-attachment://asset/example.png)',
      ),
    );

    assert.match(
      markup,
      /<img[^>]+src="devland-codex-attachment:\/\/asset\/example\.png"[^>]*alt="Browser smoke screenshot"/,
    );
  });
});
