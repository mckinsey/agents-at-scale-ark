import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  OIDC_FLOW_COOKIE_NAMES,
  SESSION_COOKIE_NAME,
  useSecureCookies,
} from '@/lib/auth/auth-config';
import { openidConfigManager } from '@/lib/auth/openid-config-manager';

// NextAuth splits a session JWT larger than ~4KB into `${name}.0`, `${name}.1`,
// ... Large OIDC tokens (id + access + refresh) routinely exceed this, and the
// client-side signOut() does not reliably clear every chunk — leaving the
// session valid after "logout". Clear the base name and chunk variants.
const MAX_COOKIE_CHUNKS = 8;

function clearSessionCookies(res: NextResponse) {
  const names = [SESSION_COOKIE_NAME];
  for (let i = 0; i < MAX_COOKIE_CHUNKS; i++) {
    names.push(`${SESSION_COOKIE_NAME}.${i}`);
  }
  // Also clear transient OIDC-flow cookies; a stale `state`/PKCE cookie
  // surviving logout fails the next sign-in's callback (error=Configuration).
  names.push(...OIDC_FLOW_COOKIE_NAMES);
  for (const name of names) {
    res.cookies.set(name, '', {
      path: '/',
      maxAge: 0,
      secure: useSecureCookies,
      httpOnly: true,
      sameSite: 'lax',
    });
  }
  return res;
}

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    cookieName: SESSION_COOKIE_NAME,
  });

  const baseURL = process.env.BASE_URL;
  const redirectURL = `${baseURL}/signout`;
  if (!token?.id_token) {
    // no session, just go home
    return clearSessionCookies(
      NextResponse.redirect(new URL('/signout', baseURL)),
    );
  }

  // Get or fetch the openid config from the OIDC provider's well-known configuration
  const openidConfig = await openidConfigManager.getConfig();

  if (!openidConfig.end_session_endpoint) {
    console.warn('Unable to retrieve end session endpoint from OIDC provider');
    console.warn('Provider does not support RP-initiated logout (e.g., Dex)');
    console.warn('Performing local sign-out only');
    // Perform local sign-out only when provider doesn't support federated logout
    return clearSessionCookies(
      NextResponse.redirect(new URL('/signout', baseURL)),
    );
  }

  const url = new URL(openidConfig.end_session_endpoint);

  url.searchParams.append('id_token_hint', String(token.id_token));
  url.searchParams.append('post_logout_redirect_uri', redirectURL);
  url.searchParams.append('client_id', process.env.OIDC_CLIENT_ID ?? '');

  // Clear the local session too, then hand off to the provider's logout.
  return clearSessionCookies(NextResponse.redirect(url));
}
