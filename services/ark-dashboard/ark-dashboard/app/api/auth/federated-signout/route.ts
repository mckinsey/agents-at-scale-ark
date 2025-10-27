import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { openidConfigManager } from '@/lib/auth/openid-config-manager';
import { COOKIE_SESSION_TOKEN } from '@/lib/constants/auth';

export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    cookieName: COOKIE_SESSION_TOKEN,
  });

  const baseURL = process.env.BASE_URL;
  const redirectURL = `${baseURL}/signout`;
  if (!token?.id_token) {
    return NextResponse.redirect(new URL('/signout', baseURL)); // no session, just go home
  }

  // Get or fetch the openid config from the OIDC provider's well-known configuration
  const openidConfig = await openidConfigManager.getConfig();
  const fallbackEndpoint = `${process.env.OIDC_ISSUER_URL}/oidc/logout`;

  if (!openidConfig.end_session_endpoint) {
    console.warn('Unable to retrieve end session endpoint from OIDC provider');
    // Fallback to the configured issuer with a common logout path
    console.warn('Using fallback endpoint:', fallbackEndpoint);
  }

  const endpoint = openidConfig.end_session_endpoint || fallbackEndpoint;
  const url = new URL(endpoint);

  url.searchParams.append('id_token_hint', token.id_token);
  url.searchParams.append('post_logout_redirect_uri', redirectURL);
  url.searchParams.append('client_id', process.env.OIDC_CLIENT_ID ?? '');

  return NextResponse.redirect(url);
}
