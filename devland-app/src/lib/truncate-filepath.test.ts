import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getTruncatedFilePathParts,
  splitFilePath,
  truncateFilePath,
  truncateMiddle,
} from '@/lib/truncate-filepath';

describe('truncateMiddle', () => {
  it('returns the original string when it already fits', () => {
    assert.equal(truncateMiddle('foo', 3), 'foo');
    assert.equal(truncateMiddle('foo', 10), 'foo');
  });

  it('returns an empty string for zero or negative lengths', () => {
    assert.equal(truncateMiddle('foo', 0), '');
    assert.equal(truncateMiddle('foo', -10), '');
  });

  it('returns only an ellipsis for a max length of one', () => {
    assert.equal(truncateMiddle('foo', 1), '…');
  });

  it('truncates from the middle to the exact requested length', () => {
    assert.equal(truncateMiddle('foo bar', 6), 'fo…bar');
    assert.equal(truncateMiddle('foo bar', 5), 'fo…ar');
    assert.equal(truncateMiddle('foo bar', 3), 'f…r');
  });
});

describe('truncateFilePath', () => {
  it('returns the original path when it already fits', () => {
    assert.equal(truncateFilePath('foo', 3), 'foo');
    assert.equal(truncateFilePath('foo', 10), 'foo');
  });

  it('returns an empty string for zero or negative lengths', () => {
    assert.equal(truncateFilePath('foo', 0), '');
    assert.equal(truncateFilePath('foo', -10), '');
  });

  it('returns only an ellipsis for a max length of one', () => {
    assert.equal(truncateFilePath('foo', 1), '…');
  });

  it('falls back to middle truncation when there is no directory prefix', () => {
    assert.equal(truncateFilePath('foo bar', 6), 'fo…bar');
    assert.equal(truncateFilePath('foo bar', 5), 'fo…ar');
    assert.equal(truncateFilePath('foo bar', 3), 'f…r');
  });

  it('prefers truncating the directory over the file name on posix paths', () => {
    assert.equal(
      truncateFilePath('alfa/bravo/charlie/delta.txt', 25),
      'alfa/bravo/cha…/delta.txt',
    );
    assert.equal(
      truncateFilePath('alfa/bravo/charlie/delta.txt', 22),
      'alfa/bravo/…/delta.txt',
    );
    assert.equal(
      truncateFilePath('alfa/bravo/charlie/delta.txt', 17),
      'alfa/b…/delta.txt',
    );
  });

  it('preserves windows separators too', () => {
    assert.equal(truncateFilePath('foo\\foo bar', 9), '…\\foo bar');
    assert.equal(
      truncateFilePath('alfa\\bravo\\charlie\\delta.txt', 22),
      'alfa\\bravo\\…\\delta.txt',
    );
  });

  it('falls back to middle truncation when the file name alone is too long', () => {
    assert.equal(
      truncateFilePath('src/renderer/components/very-long-file-name.tsx', 12),
      'src/r…me.tsx',
    );
  });
});

describe('splitFilePath', () => {
  it('splits a regular file path into directory and file name', () => {
    assert.deepEqual(splitFilePath('src/renderer/pr-review-dialog.tsx'), {
      directory: 'src/renderer/',
      fileName: 'pr-review-dialog.tsx',
    });
  });

  it('treats trailing separators like a directory name', () => {
    assert.deepEqual(splitFilePath('some/submodule/path/'), {
      directory: 'some/submodule/',
      fileName: 'path',
    });
  });
});

describe('getTruncatedFilePathParts', () => {
  it('returns split parts for the truncated path', () => {
    assert.deepEqual(
      getTruncatedFilePathParts('src/renderer/components/pr-review-dialog.tsx', 32),
      {
        directory: 'src/render…/',
        fileName: 'pr-review-dialog.tsx',
        isTruncated: true,
        path: 'src/render…/pr-review-dialog.tsx',
      },
    );
  });
});
