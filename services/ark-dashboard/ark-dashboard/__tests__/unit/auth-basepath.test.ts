import { describe, expect, it } from 'vitest';

import { prefixPathname } from '@/lib/auth/base-path';

// Regression for the OIDC callback under a tenant prefix: Next.js strips the
// basePath before the auth route handler runs, but Auth.js's basePath (derived
// from AUTH_URL) still carries the prefix, so the stripped
// /api/auth/callback/<id> fails Auth.js's action parser (UnknownAction -> 400).
// prefixPathname realigns the inbound pathname before Auth.js parses it.
describe('prefixPathname', () => {
  it('re-inserts the prefix Next stripped from the callback path', () => {
    expect(
      prefixPathname('/api/auth/callback/keycloak', '/nstenant'),
    ).toBe('/nstenant/api/auth/callback/keycloak');
  });

  it('is a no-op when the prefix is already present', () => {
    expect(
      prefixPathname('/nstenant/api/auth/callback/keycloak', '/nstenant'),
    ).toBe('/nstenant/api/auth/callback/keycloak');
  });

  it('is a no-op when the pathname equals the base path exactly', () => {
    expect(prefixPathname('/nstenant', '/nstenant')).toBe('/nstenant');
  });

  it('does not prefix a path that merely shares the prefix string', () => {
    // /nstenant-other must not be treated as being under /nstenant
    expect(prefixPathname('/nstenant-other/x', '/nstenant')).toBe(
      '/nstenant/nstenant-other/x',
    );
  });

  it('is a no-op at the root (empty base path)', () => {
    expect(prefixPathname('/api/auth/callback/keycloak', '')).toBe(
      '/api/auth/callback/keycloak',
    );
  });
});
