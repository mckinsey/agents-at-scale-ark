import { describe, expect, it } from 'vitest';

import { normalizeArgoUrl } from '@/lib/utils/argo-url';

describe('normalizeArgoUrl', () => {
  it('returns undefined when unset', () => {
    expect(normalizeArgoUrl(undefined)).toBeUndefined();
  });

  it('treats empty and whitespace-only values as unset', () => {
    expect(normalizeArgoUrl('')).toBeUndefined();
    expect(normalizeArgoUrl('   ')).toBeUndefined();
  });

  it('trims whitespace and trailing slashes', () => {
    expect(normalizeArgoUrl(' https://argo.example.com// ')).toBe(
      'https://argo.example.com',
    );
  });

  it('keeps a path prefix', () => {
    expect(normalizeArgoUrl('https://example.com/argo/')).toBe(
      'https://example.com/argo',
    );
  });
});
