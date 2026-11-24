import type { JWT } from '@auth/core/jwt';
import { encode } from '@auth/core/jwt';
import { cookies } from 'next/headers';

import {
  SESSION_COOKIE_NAME,
  getSessionMaxAge,
  useSecureCookies,
} from './auth-config';

const ALLOWED_COOKIE_SIZE = 4096;
const ESTIMATED_EMPTY_COOKIE_SIZE = 160;
const CHUNK_SIZE = ALLOWED_COOKIE_SIZE - ESTIMATED_EMPTY_COOKIE_SIZE;

function chunkNames(value: string): string[] {
  if (value.length <= CHUNK_SIZE) return [SESSION_COOKIE_NAME];
  const count = Math.ceil(value.length / CHUNK_SIZE);
  return Array.from({ length: count }, (_, i) => `${SESSION_COOKIE_NAME}.${i}`);
}

// Two writers set the session cookie on a refreshing request: middleware's
// auth() wrapper emits the pre-refresh token, then this emits the refreshed
// one. The browser keeps the last Set-Cookie of a given name (RFC 6265), so
// the refreshed value wins — but only while Next merges middleware headers
// ahead of the route handler's, which is not specified anywhere.
//
// Do NOT remove one writer by moving the refresh into the jwt callback.
// Middleware runs on edge and route handlers on nodejs, so each gets its own
// refresh-coordinator map and both would refresh; the second spends an
// already-rotated refresh token, and the IdP revokes the whole token family
// rather than just rejecting it. The route needs its own refreshed value
// anyway: getToken() reads the inbound cookie, which is pre-refresh.
export async function persistSessionToken(token: JWT): Promise<void> {
  const maxAge = getSessionMaxAge();

  const value = await encode({
    token,
    secret: process.env.AUTH_SECRET!,
    salt: SESSION_COOKIE_NAME,
    maxAge,
  });

  const store = await cookies();
  const names = chunkNames(value);

  for (const existing of store.getAll()) {
    const isSessionCookie =
      existing.name === SESSION_COOKIE_NAME ||
      existing.name.startsWith(`${SESSION_COOKIE_NAME}.`);
    if (isSessionCookie && !names.includes(existing.name)) {
      store.delete(existing.name);
    }
  }

  names.forEach((name, index) => {
    store.set(name, value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: useSecureCookies,
      maxAge,
    });
  });
}
