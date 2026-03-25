import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseMarkdownFileLink } from './markdown-file-links';

const REPO_PATH = '/Users/rafa/github.com/rafbgarcia/devland';

describe('parseMarkdownFileLink', () => {
  it('parses hash line references used by Codex file links', () => {
    assert.deepEqual(
      parseMarkdownFileLink(
        '/Users/rafa/github.com/rafbgarcia/devland/devland-app/src/renderer/extensions-screen/extension-tab-menu.tsx#L140',
        REPO_PATH,
      ),
      {
        absoluteFilePath: '/Users/rafa/github.com/rafbgarcia/devland/devland-app/src/renderer/extensions-screen/extension-tab-menu.tsx',
        relativeFilePath: 'devland-app/src/renderer/extensions-screen/extension-tab-menu.tsx',
        lineNumber: 140,
        columnNumber: null,
      },
    );
  });

  it('parses colon and plain hash line variants seamlessly', () => {
    assert.deepEqual(
      parseMarkdownFileLink(
        '/Users/rafa/github.com/rafbgarcia/devland/devland-app/src/App.tsx:15:3',
        REPO_PATH,
      ),
      {
        absoluteFilePath: '/Users/rafa/github.com/rafbgarcia/devland/devland-app/src/App.tsx',
        relativeFilePath: 'devland-app/src/App.tsx',
        lineNumber: 15,
        columnNumber: 3,
      },
    );

    assert.deepEqual(
      parseMarkdownFileLink(
        '/Users/rafa/github.com/rafbgarcia/devland/devland-app/src/App.tsx#123',
        REPO_PATH,
      ),
      {
        absoluteFilePath: '/Users/rafa/github.com/rafbgarcia/devland/devland-app/src/App.tsx',
        relativeFilePath: 'devland-app/src/App.tsx',
        lineNumber: 123,
        columnNumber: null,
      },
    );
  });

  it('prefers hash positions when both syntaxes are present', () => {
    assert.deepEqual(
      parseMarkdownFileLink(
        '/Users/rafa/github.com/rafbgarcia/devland/devland-app/src/App.tsx:15#L99C7',
        REPO_PATH,
      ),
      {
        absoluteFilePath: '/Users/rafa/github.com/rafbgarcia/devland/devland-app/src/App.tsx',
        relativeFilePath: 'devland-app/src/App.tsx',
        lineNumber: 99,
        columnNumber: 7,
      },
    );
  });

  it('supports file urls that point into the current repo', () => {
    assert.deepEqual(
      parseMarkdownFileLink(
        'file:///Users/rafa/github.com/rafbgarcia/devland/devland-app/src/App.tsx#L20',
        REPO_PATH,
      ),
      {
        absoluteFilePath: '/Users/rafa/github.com/rafbgarcia/devland/devland-app/src/App.tsx',
        relativeFilePath: 'devland-app/src/App.tsx',
        lineNumber: 20,
        columnNumber: null,
      },
    );
  });

  it('ignores links that are outside the active repo', () => {
    assert.equal(
      parseMarkdownFileLink(
        '/Users/rafa/github.com/another-repo/src/App.tsx#L20',
        REPO_PATH,
      ),
      null,
    );
  });
});
