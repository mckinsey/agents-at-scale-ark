import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Auth-config.ts pulls in NextAuth + provider machinery on import. Mock
// the side-effectful pieces so we can re-import the module under
// different AUTH_URL values without dragging the OIDC client along.
vi.mock('@/lib/auth/create-oidc-provider', () => ({
  createOIDCProvider: vi.fn(() => ({
    id: 'mock-oidc',
    name: 'mock',
    type: 'oauth',
  })),
}));

vi.mock('@/lib/auth/token-manager', () => ({
  TokenManager: { getNewAccessToken: vi.fn() },
}));

describe('SESSION_COOKIE_NAME (issue #2318)', () => {
  const originalAuthUrl = process.env.AUTH_URL;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalAuthUrl === undefined) {
      delete process.env.AUTH_URL;
    } else {
      process.env.AUTH_URL = originalAuthUrl;
    }
  });

  it('uses the __Secure- prefix when AUTH_URL is HTTPS', async () => {
    process.env.AUTH_URL = 'https://dashboard.example.com';
    const { SESSION_COOKIE_NAME, useSecureCookies } = await import(
      '@/lib/auth/auth-config'
    );
    expect(useSecureCookies).toBe(true);
    expect(SESSION_COOKIE_NAME).toBe('__Secure-session-token');
  });

  it('omits the prefix when AUTH_URL is HTTP', async () => {
    process.env.AUTH_URL = 'http://dashboard.example.com';
    const { SESSION_COOKIE_NAME, useSecureCookies } = await import(
      '@/lib/auth/auth-config'
    );
    expect(useSecureCookies).toBe(false);
    expect(SESSION_COOKIE_NAME).toBe('session-token');
  });

  it('omits the prefix when AUTH_URL is unset', async () => {
    delete process.env.AUTH_URL;
    const { SESSION_COOKIE_NAME, useSecureCookies } = await import(
      '@/lib/auth/auth-config'
    );
    expect(useSecureCookies).toBe(false);
    expect(SESSION_COOKIE_NAME).toBe('session-token');
  });
});
