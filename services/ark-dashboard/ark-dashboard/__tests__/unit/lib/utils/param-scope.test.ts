import { describe, expect, it } from 'vitest';

import { APP_SCOPED_PARAMS, buildScopedPath } from '@/lib/utils/param-scope';

describe('APP_SCOPED_PARAMS', () => {
  it('scopes namespace and nothing else', () => {
    expect(APP_SCOPED_PARAMS).toEqual(['namespace']);
  });
});

describe('buildScopedPath', () => {
  it('keeps every param when the target is the current pathname', () => {
    const current = new URLSearchParams(
      'namespace=test-ns&status=failed&page=2',
    );

    expect(buildScopedPath('/events', current, '/events')).toBe(
      '/events?namespace=test-ns&status=failed&page=2',
    );
  });

  it('keeps only app-scoped params when the pathname changes', () => {
    const current = new URLSearchParams(
      'namespace=test-ns&status=failed&page=2',
    );

    expect(buildScopedPath('/agents', current, '/events')).toBe(
      '/agents?namespace=test-ns',
    );
  });

  it('lets a param named by the target override a carried param', () => {
    const current = new URLSearchParams('namespace=test-ns');

    expect(
      buildScopedPath('/agents?namespace=other-ns', current, '/events'),
    ).toBe('/agents?namespace=other-ns');
  });

  it('applies params named by the target alongside app-scoped params', () => {
    const current = new URLSearchParams('namespace=test-ns&name=leaked');

    expect(
      buildScopedPath('/query/new?target_tool=mytool', current, '/tools'),
    ).toBe('/query/new?namespace=test-ns&target_tool=mytool');
  });

  it('returns a bare path when nothing survives the scope', () => {
    const current = new URLSearchParams('name=default');

    expect(buildScopedPath('/models', current, '/models/new')).toBe('/models');
  });

  it('keeps a target-named param even when it is page-local', () => {
    const current = new URLSearchParams('namespace=test-ns');

    expect(buildScopedPath('/models/new?name=default', current, '/')).toBe(
      '/models/new?namespace=test-ns&name=default',
    );
  });

  it('handles absent search params', () => {
    expect(buildScopedPath('/agents', null, '/events')).toBe('/agents');
    expect(buildScopedPath('/agents', undefined, '/events')).toBe('/agents');
  });

  it('handles an unknown current pathname as a cross-screen navigation', () => {
    const current = new URLSearchParams('namespace=test-ns&page=2');

    expect(buildScopedPath('/agents', current, null)).toBe(
      '/agents?namespace=test-ns',
    );
  });
});
