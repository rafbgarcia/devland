import { describe, expect, it } from 'bun:test';

import {
  compareSemver,
  extractSdkVersionFromTag,
  extractVersionFromTag,
  parseGitHubExtensionSource,
  rewriteGitHubExtensionSourceVersion,
} from './release-utils';

describe('compareSemver', () => {
  it('orders stable versions numerically', () => {
    expect(compareSemver('0.1.2', '0.1.1')).toBeGreaterThan(0);
    expect(compareSemver('0.2.0', '0.10.0')).toBeLessThan(0);
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
  });

  it('orders prereleases below the stable version', () => {
    expect(compareSemver('0.1.2-beta.1', '0.1.2')).toBeLessThan(0);
    expect(compareSemver('0.1.2-beta.2', '0.1.2-beta.1')).toBeGreaterThan(0);
  });
});

describe('extractVersionFromTag', () => {
  it('parses shared release tags', () => {
    expect(extractVersionFromTag('v0.1.2')).toBe('0.1.2');
  });

  it('parses legacy extension release tags', () => {
    expect(extractVersionFromTag('ext/gh-prs/0.1.1')).toBe('0.1.1');
  });

  it('ignores unsupported tags', () => {
    expect(extractVersionFromTag('feature/demo')).toBeNull();
  });

  it('ignores malformed semver tags', () => {
    expect(extractVersionFromTag('vnext')).toBeNull();
    expect(extractVersionFromTag('ext/gh-prs/latest')).toBeNull();
  });
});

describe('extractSdkVersionFromTag', () => {
  it('parses SDK release tags', () => {
    expect(extractSdkVersionFromTag('sdk/v0.1.2')).toBe('0.1.2');
  });

  it('ignores unsupported SDK tags', () => {
    expect(extractSdkVersionFromTag('sdk/0.1.2')).toBeNull();
    expect(extractSdkVersionFromTag('sdk/vnext')).toBeNull();
  });
});

describe('parseGitHubExtensionSource', () => {
  it('parses github extension release sources', () => {
    expect(parseGitHubExtensionSource('github:rafbgarcia/devland@v0.3.3#gh-prs.tgz')).toEqual({
      owner: 'rafbgarcia',
      repo: 'devland',
      version: 'v0.3.3',
      assetName: 'gh-prs.tgz',
    });
  });

  it('ignores non-github extension sources', () => {
    expect(parseGitHubExtensionSource('path:./extensions/gh-prs')).toBeNull();
  });
});

describe('rewriteGitHubExtensionSourceVersion', () => {
  it('updates only the version segment of a github extension source', () => {
    expect(
      rewriteGitHubExtensionSourceVersion('github:rafbgarcia/devland@v0.2.0#gh-prs.tgz', '0.3.3'),
    ).toBe('github:rafbgarcia/devland@v0.3.3#gh-prs.tgz');
  });

  it('leaves unsupported sources unchanged', () => {
    expect(rewriteGitHubExtensionSourceVersion('path:./extensions/gh-prs', '0.3.3')).toBe(
      'path:./extensions/gh-prs',
    );
  });
});
