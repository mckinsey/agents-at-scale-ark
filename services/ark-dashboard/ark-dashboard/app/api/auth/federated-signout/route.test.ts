import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { openidConfigManager } from '@/lib/auth/openid-config-manager';

import { GET } from './route';

vi.mock('next-auth/jwt', () => ({ getToken: vi.fn() }));
vi.mock('@/lib/auth/auth-config', () => ({
  SESSION_COOKIE_NAME: '__Secure-session-token',
  useSecureCookies: true,
  OIDC_FLOW_COOKIE_NAMES: [
    '__Secure-callback-url',
    '__Host-csrf-token',
    '__Secure-pkce.code_verifier',
    '__Secure-state',
    '__Secure-nonce',
  ],
}));
vi.mock('@/lib/auth/openid-config-manager', () => ({
  openidConfigManager: { getConfig: vi.fn() },
}));

const SESSION = '__Secure-session-token';

function request() {
  return new NextRequest(
    new URL('https://dashboard.example.com/api/auth/federated-signout'),
  );
}

describe('GET /api/auth/federated-signout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BASE_URL = 'https://dashboard.example.com';
    process.env.AUTH_SECRET = 'test-secret';
    delete process.env.OIDC_CLIENT_ID;
  });

  it('clears the session cookie + chunks and redirects to /signout when there is no session', async () => {
    vi.mocked(getToken).mockResolvedValue(null as never);

    const res = await GET(request());

    expect(res.headers.get('location')).toBe(
      'https://dashboard.example.com/signout',
    );
    expect(res.cookies.get(SESSION)?.value).toBe('');
    expect(res.cookies.get(`${SESSION}.0`)?.value).toBe('');
    expect(res.cookies.get(`${SESSION}.7`)?.value).toBe('');
  });

  it('clears the transient OIDC-flow cookies (state, PKCE, nonce, callback-url, CSRF)', async () => {
    vi.mocked(getToken).mockResolvedValue(null as never);

    const res = await GET(request());

    for (const name of [
      '__Secure-callback-url',
      '__Host-csrf-token',
      '__Secure-pkce.code_verifier',
      '__Secure-state',
      '__Secure-nonce',
    ]) {
      expect(res.cookies.get(name)?.value).toBe('');
      expect(res.cookies.get(name)?.maxAge).toBe(0);
    }
  });

  it('falls back to local /signout (clearing cookies) when the provider has no end_session_endpoint', async () => {
    vi.mocked(getToken).mockResolvedValue({ id_token: 'id-tok' } as never);
    vi.mocked(openidConfigManager.getConfig).mockResolvedValue({} as never);

    const res = await GET(request());

    expect(res.headers.get('location')).toBe(
      'https://dashboard.example.com/signout',
    );
    expect(res.cookies.get(SESSION)?.value).toBe('');
  });

  it('redirects to the provider end_session_endpoint and clears local cookies', async () => {
    process.env.OIDC_CLIENT_ID = 'client-123';
    vi.mocked(getToken).mockResolvedValue({ id_token: 'id-tok' } as never);
    vi.mocked(openidConfigManager.getConfig).mockResolvedValue({
      end_session_endpoint: 'https://idp.example.com/logout',
    } as never);

    const res = await GET(request());

    const loc = new URL(res.headers.get('location') as string);
    expect(`${loc.origin}${loc.pathname}`).toBe(
      'https://idp.example.com/logout',
    );
    expect(loc.searchParams.get('id_token_hint')).toBe('id-tok');
    expect(loc.searchParams.get('post_logout_redirect_uri')).toBe(
      'https://dashboard.example.com/signout',
    );
    expect(loc.searchParams.get('client_id')).toBe('client-123');
    expect(res.cookies.get(SESSION)?.value).toBe('');
  });
});
