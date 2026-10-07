import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/lib/auth/auth-config';
import {
  isAccessTokenExpiring,
  refreshAccessToken,
} from '@/lib/auth/refresh-coordinator';
import { persistSessionToken } from '@/lib/auth/session-cookie';
import { TokenRefreshError } from '@/lib/auth/token-manager';

/**
 * Mints an `Authorization` header for ark-api from the incoming request's
 * NextAuth session JWT, the same way `app/api/v1/[...proxy]/route.ts` does
 * for client-side calls. In open mode the session cookie is absent and
 * `getToken` returns null, so an empty header set is returned.
 */
export async function getArkApiAuthHeaders(
  request: NextRequest,
): Promise<HeadersInit> {
  let token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    cookieName: SESSION_COOKIE_NAME,
  });

  if (token && isAccessTokenExpiring(token)) {
    try {
      token = await refreshAccessToken(token);
      await persistSessionToken(token);
    } catch (error) {
      const code =
        error instanceof TokenRefreshError ? error.code : 'refresh_failed';
      console.error(
        `[server-auth-headers] access token refresh failed (${code})`,
        error instanceof Error ? (error.cause ?? error.message) : error,
      );
    }
  }

  if (
    token &&
    typeof token === 'object' &&
    'access_token' in token &&
    typeof token.access_token === 'string'
  ) {
    return { Authorization: `Bearer ${token.access_token}` };
  }

  return {};
}
