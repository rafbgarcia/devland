import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { detectDiffHighlightLanguage } from '@/lib/diff/shiki-support';

describe('detectDiffHighlightLanguage', () => {
  it('maps known extensions and basenames to Shiki language ids', () => {
    assert.equal(
      detectDiffHighlightLanguage({
        basename: 'Dockerfile',
        extension: '',
        contentLines: [],
      }),
      'dockerfile',
    );
    assert.equal(
      detectDiffHighlightLanguage({
        basename: 'Cargo.lock',
        extension: '.lock',
        contentLines: [],
      }),
      'toml',
    );
    assert.equal(
      detectDiffHighlightLanguage({
        basename: 'app.csproj',
        extension: '.csproj',
        contentLines: [],
      }),
      'xml',
    );
    assert.equal(
      detectDiffHighlightLanguage({
        basename: 'header.h',
        extension: '.h',
        contentLines: [],
      }),
      'c',
    );
  });

  it('falls back to shebang and XML declarations when needed', () => {
    assert.equal(
      detectDiffHighlightLanguage({
        basename: 'tool',
        extension: '',
        contentLines: ['#!/usr/bin/env python3', 'print("hi")'],
      }),
      'python',
    );
    assert.equal(
      detectDiffHighlightLanguage({
        basename: 'config',
        extension: '',
        contentLines: ['<?xml version="1.0"?>', '<root />'],
      }),
      'xml',
    );
  });
});
