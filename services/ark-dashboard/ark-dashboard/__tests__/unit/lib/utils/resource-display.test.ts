import { describe, expect, it } from 'vitest';

import { displayName, hasAlias } from '@/lib/utils/resource-display';

describe('displayName', () => {
  it('returns the alias when one is set', () => {
    expect(displayName({ name: 'mcp-url-prod', alias: 'mcp-url' })).toBe(
      'mcp-url',
    );
  });

  it('falls back to the name when there is no alias', () => {
    expect(displayName({ name: 'mcp-url-prod' })).toBe('mcp-url-prod');
    expect(displayName({ name: 'mcp-url-prod', alias: null })).toBe(
      'mcp-url-prod',
    );
  });

  it('ignores a whitespace-only alias', () => {
    expect(displayName({ name: 'mcp-url-prod', alias: '   ' })).toBe(
      'mcp-url-prod',
    );
  });

  it('trims a padded alias', () => {
    expect(displayName({ name: 'mcp-url-prod', alias: ' mcp-url ' })).toBe(
      'mcp-url',
    );
  });
});

describe('hasAlias', () => {
  it('is true when the alias differs from the name', () => {
    expect(hasAlias({ name: 'mcp-url-prod', alias: 'mcp-url' })).toBe(true);
  });

  it('is false without an alias', () => {
    expect(hasAlias({ name: 'mcp-url-prod' })).toBe(false);
  });

  it('is false when the alias equals the name', () => {
    expect(hasAlias({ name: 'mcp-url', alias: 'mcp-url' })).toBe(false);
  });
});
