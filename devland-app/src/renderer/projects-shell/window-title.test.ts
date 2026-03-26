import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildProjectWindowTitle,
  replaceHomeDirectoryForDisplay,
} from './window-title';

describe('replaceHomeDirectoryForDisplay', () => {
  it('replaces a matching macos or linux home-directory prefix', () => {
    assert.equal(
      replaceHomeDirectoryForDisplay(
        '/Users/rafa/github.com/rafbgarcia/devland',
        '/Users/rafa',
      ),
      '~/github.com/rafbgarcia/devland',
    );
    assert.equal(
      replaceHomeDirectoryForDisplay(
        '/home/rafa/src/devland',
        '/home/rafa',
      ),
      '~/src/devland',
    );
  });

  it('replaces a matching windows home-directory prefix case-insensitively', () => {
    assert.equal(
      replaceHomeDirectoryForDisplay(
        'C:\\Users\\Rafa\\src\\devland',
        'c:\\users\\rafa',
      ),
      '~/src/devland',
    );
  });

  it('falls back to the original path when it is outside the home directory', () => {
    assert.equal(
      replaceHomeDirectoryForDisplay('/opt/devland', '/Users/rafa'),
      '/opt/devland',
    );
  });
});

describe('buildProjectWindowTitle', () => {
  it('includes the active project path and branch when both are available', () => {
    assert.equal(
      buildProjectWindowTitle({
        projectPath: '/Users/rafa/github.com/rafbgarcia/devland',
        branchName: 'feature/window-title',
        homeDirectory: '/Users/rafa',
      }),
      'Devland ~/github.com/rafbgarcia/devland @ feature/window-title',
    );
  });

  it('falls back to the project path when branch metadata is unavailable', () => {
    assert.equal(
      buildProjectWindowTitle({
        projectPath: '/Users/rafa/github.com/rafbgarcia/devland',
        branchName: null,
        homeDirectory: '/Users/rafa',
      }),
      'Devland ~/github.com/rafbgarcia/devland',
    );
  });

  it('falls back to the app name when no active project is available', () => {
    assert.equal(
      buildProjectWindowTitle({
        projectPath: null,
        branchName: null,
      }),
      'Devland',
    );
  });

  it('uses the provided app name when present', () => {
    assert.equal(
      buildProjectWindowTitle({
        projectPath: '/repo',
        branchName: 'main',
        appName: 'Devland:dev',
      }),
      'Devland:dev /repo @ main',
    );
  });
});
