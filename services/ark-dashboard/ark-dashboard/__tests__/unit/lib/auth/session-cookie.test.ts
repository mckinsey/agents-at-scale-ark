import type { JWT } from '@auth/core/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookieStore: {
    getAll: vi.fn<() => { name: string; value: string }[]>(() => []),
    set: vi.fn(),
    delete: vi.fn(),
  },
  encode: vi.fn<() => Promise<string>>(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mocks.cookieStore),
}));

vi.mock('@auth/core/jwt', () => ({
  encode: mocks.encode,
}));

vi.mock('@/lib/auth/auth-config', () => ({
  SESSION_COOKIE_NAME: 'session-token',
  getSessionMaxAge: () => 1800,
  useSecureCookies: false,
}));

// Mirrors ALLOWED_COOKIE_SIZE - ESTIMATED_EMPTY_COOKIE_SIZE in session-cookie.ts,
// which in turn mirrors @auth/core's own chunker.
const CHUNK_SIZE = 4096 - 160;

const token: JWT = {
  sub: 'user123',
  access_token: 'access-token-a',
  refresh_token: 'refresh-token-a',
  expires_at: 1_700_000_300,
};

function existingCookies(...names: string[]) {
  mocks.cookieStore.getAll.mockReturnValue(
    names.map(name => ({ name, value: 'x' })),
  );
}

function setCallFor(name: string) {
  return mocks.cookieStore.set.mock.calls.find(call => call[0] === name);
}

describe('persistSessionToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookieStore.getAll.mockReturnValue([]);
    process.env.AUTH_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete process.env.AUTH_SECRET;
  });

  it('writes a single unchunked cookie when the session fits', async () => {
    mocks.encode.mockResolvedValue('a'.repeat(100));
    const { persistSessionToken } = await import('@/lib/auth/session-cookie');

    await persistSessionToken(token);

    expect(mocks.cookieStore.set).toHaveBeenCalledTimes(1);
    expect(mocks.cookieStore.set.mock.calls[0][0]).toBe('session-token');
    expect(mocks.cookieStore.set.mock.calls[0][1]).toBe('a'.repeat(100));
  });

  it('splits an oversized session across numbered chunks that rejoin exactly', async () => {
    const value = 'b'.repeat(CHUNK_SIZE + 1064);
    mocks.encode.mockResolvedValue(value);
    const { persistSessionToken } = await import('@/lib/auth/session-cookie');

    await persistSessionToken(token);

    const names = mocks.cookieStore.set.mock.calls.map(call => call[0]);
    expect(names).toEqual(['session-token.0', 'session-token.1']);

    const rejoined = mocks.cookieStore.set.mock.calls
      .map(call => call[1] as string)
      .join('');
    expect(rejoined).toBe(value);
    expect(rejoined).toHaveLength(value.length);
  });

  it('deletes a stale higher-numbered chunk when the session shrinks', async () => {
    existingCookies('session-token.0', 'session-token.1', 'session-token.2');
    mocks.encode.mockResolvedValue('c'.repeat(CHUNK_SIZE + 10));
    const { persistSessionToken } = await import('@/lib/auth/session-cookie');

    await persistSessionToken(token);

    expect(mocks.cookieStore.delete).toHaveBeenCalledWith('session-token.2');
    expect(mocks.cookieStore.delete).not.toHaveBeenCalledWith(
      'session-token.0',
    );
    expect(mocks.cookieStore.delete).not.toHaveBeenCalledWith(
      'session-token.1',
    );
  });

  it('clears leftover chunks when a previously chunked session now fits in one cookie', async () => {
    existingCookies('session-token.0', 'session-token.1');
    mocks.encode.mockResolvedValue('d'.repeat(50));
    const { persistSessionToken } = await import('@/lib/auth/session-cookie');

    await persistSessionToken(token);

    expect(mocks.cookieStore.delete).toHaveBeenCalledWith('session-token.0');
    expect(mocks.cookieStore.delete).toHaveBeenCalledWith('session-token.1');
    expect(setCallFor('session-token')).toBeDefined();
  });

  it('leaves unrelated cookies alone', async () => {
    existingCookies('session-token.0', 'csrf-token', 'callback-url');
    mocks.encode.mockResolvedValue('e'.repeat(50));
    const { persistSessionToken } = await import('@/lib/auth/session-cookie');

    await persistSessionToken(token);

    expect(mocks.cookieStore.delete).toHaveBeenCalledWith('session-token.0');
    expect(mocks.cookieStore.delete).not.toHaveBeenCalledWith('csrf-token');
    expect(mocks.cookieStore.delete).not.toHaveBeenCalledWith('callback-url');
  });

  it('writes httpOnly, lax, root-path cookies carrying the session max age', async () => {
    mocks.encode.mockResolvedValue('f'.repeat(20));
    const { persistSessionToken } = await import('@/lib/auth/session-cookie');

    await persistSessionToken(token);

    expect(mocks.cookieStore.set.mock.calls[0][2]).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
      maxAge: 1800,
    });
  });

  it('encodes the token under the session cookie name as salt', async () => {
    mocks.encode.mockResolvedValue('g'.repeat(20));
    const { persistSessionToken } = await import('@/lib/auth/session-cookie');

    await persistSessionToken(token);

    expect(mocks.encode).toHaveBeenCalledWith({
      token,
      secret: 'test-secret',
      salt: 'session-token',
      maxAge: 1800,
    });
  });
});
