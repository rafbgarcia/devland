import { describe, expect, it } from 'bun:test';

import { compareSemver, extractVersionFromTag } from './release';

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
