import type { JWT } from '@auth/core/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authConfig } from '@/lib/auth/auth-config';
import { refreshAccessToken } from '@/lib/auth/refresh-coordinator';
import { TokenRefreshError } from '@/lib/auth/token-manager';

vi.mock('@/lib/auth/create-oidc-provider', () => ({
  createOIDCProvider: vi.fn(() => ({
    id: 'mock-oidc',
    name: 'mock',
    type: 'oauth',
  })),
}));

vi.mock('@/lib/auth/refresh-coordinator', () => ({
  refreshAccessToken: vi.fn(),
}));

type JwtCallback = NonNullable<NonNullable<typeof authConfig.callbacks>['jwt']>;
type SessionCallback = NonNullable<
  NonNullable<typeof authConfig.callbacks>['session']
>;

const jwt = authConfig.callbacks?.jwt as JwtCallback;
const sessionCallback = authConfig.callbacks?.session as SessionCallback;

function callJwt(args: Record<string, unknown>) {
  return jwt(args as unknown as Parameters<JwtCallback>[0]);
}

function callSession(args: Record<string, unknown>) {
  return sessionCallback(args as unknown as Parameters<SessionCallback>[0]);
}

const staleToken: JWT = {
  sub: 'user123',
  access_token: 'stale-access-token',
  refresh_token: 'refresh-token-a',
  expires_at: 1_700_000_000,
};

describe('jwt callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('stores the provider tokens on sign in', async () => {
    const result = await callJwt({
      token: { sub: 'user123' },
      trigger: 'signIn',
      account: {
        access_token: 'access-token-a',
        refresh_token: 'refresh-token-a',
        expires_at: 1_700_000_300,
        id_token: 'id-token-a',
      },
    });

    expect(result).toMatchObject({
      access_token: 'access-token-a',
      refresh_token: 'refresh-token-a',
      expires_at: 1_700_000_300,
      id_token: 'id-token-a',
    });
  });

  it('refreshes when the client asks for it', async () => {
    const refreshed: JWT = {
      ...staleToken,
      access_token: 'fresh-access-token',
      expires_at: 1_700_000_300,
    };
    vi.mocked(refreshAccessToken).mockResolvedValueOnce(refreshed);

    const result = await callJwt({
      token: staleToken,
      trigger: 'update',
      session: { shouldRefreshToken: true },
    });

    expect(refreshAccessToken).toHaveBeenCalledWith(staleToken);
    expect(result).toMatchObject({ access_token: 'fresh-access-token' });
  });

  it('clears a previous error once a refresh succeeds', async () => {
    vi.mocked(refreshAccessToken).mockResolvedValueOnce({
      ...staleToken,
      error: 'invalid_grant',
      access_token: 'fresh-access-token',
    });

    const result = await callJwt({
      token: { ...staleToken, error: 'invalid_grant' },
      trigger: 'update',
      session: { shouldRefreshToken: true },
    });

    expect(result).not.toHaveProperty('error');
  });

  it('flags invalid_grant on the token instead of throwing', async () => {
    vi.mocked(refreshAccessToken).mockRejectedValueOnce(
      new TokenRefreshError('invalid_grant'),
    );

    const result = await callJwt({
      token: staleToken,
      trigger: 'update',
      session: { shouldRefreshToken: true },
    });

    expect(result).toMatchObject({ error: 'invalid_grant' });
  });

  it('falls back to a generic code for a non-TokenRefreshError failure', async () => {
    vi.mocked(refreshAccessToken).mockRejectedValueOnce(
      new Error('socket hang up'),
    );

    const result = await callJwt({
      token: staleToken,
      trigger: 'update',
      session: { shouldRefreshToken: true },
    });

    expect(result).toMatchObject({ error: 'refresh_failed' });
  });

  it('logs the reason so a refresh failure is diagnosable', async () => {
    const cause = { error: 'invalid_grant', error_description: 'expired' };
    vi.mocked(refreshAccessToken).mockRejectedValueOnce(
      new TokenRefreshError('invalid_grant', { cause }),
    );

    await callJwt({
      token: staleToken,
      trigger: 'update',
      session: { shouldRefreshToken: true },
    });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('invalid_grant'),
      cause,
    );
  });

  it('does not refresh when the update carries no refresh flag', async () => {
    const result = await callJwt({
      token: staleToken,
      trigger: 'update',
      session: {},
    });

    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(result).toBe(staleToken);
  });

  it('does not refresh on an ordinary session read', async () => {
    const result = await callJwt({ token: staleToken });

    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(result).toBe(staleToken);
  });
});

describe('session callback', () => {
  it('surfaces a refresh error so the client can re-authenticate', () => {
    const result = callSession({
      session: { user: {} },
      token: { sub: 'user123', error: 'invalid_grant' },
    });

    expect(result).toMatchObject({ error: 'invalid_grant' });
  });

  it('leaves a healthy session unflagged', () => {
    const result = callSession({
      session: { user: {} },
      token: { sub: 'user123' },
    });

    expect(result).not.toHaveProperty('error');
  });
});
