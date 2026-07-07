import { NextResponse } from 'next/server';

import { type NextRequestWithAuth, auth } from './auth';
import { SIGNIN_PATH } from './lib/constants/auth';

// Auth-only edge gate. The proxy logic that used to live here now lives in
// app/api/v1/[...proxy]/route.ts; this file restores the authentication gate
// that was lost when the original middleware.ts was renamed (commit 001616dd9).
//
// In open mode, auth.ts's openauth wrapper injects a dummy session, so req.auth
// is always truthy and nothing is redirected. In sso mode NextAuth populates
// req.auth from the session; an unauthenticated request is redirected to the
// sign-in page.
//
// NB: we deliberately do NOT use `export const config = { matcher }`. The
// negative-lookahead matcher string that worked on the pre-16 build compiles to
// an invalid RegExp under Next.js 16 ("Unmatched ')'"), crashing the server on
// every request. Filtering excluded paths in-code is version-robust and matches
// the same exclusions the old matcher expressed.
const PUBLIC_PREFIXES = [
  '/api/auth',
  '/signout',
  '/_next/static',
  '/_next/image',
];

// Strip trailing slashes without a regex (avoids Sonar S5852 ReDoS heuristics).
function stripTrailingSlashes(value?: string): string | undefined {
  if (!value) return value;
  let end = value.length;
  while (end > 0 && value.charAt(end - 1) === '/') end -= 1;
  return value.slice(0, end);
}

export default auth(async (req: NextRequestWithAuth) => {
  const { pathname } = req.nextUrl;

  if (
    pathname === '/favicon.ico' ||
    PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  if (!req.auth && pathname !== SIGNIN_PATH) {
    const callbackUrl = encodeURIComponent(req.nextUrl.href);
    // Hub model: when AUTH_HUB_URL is set, send unauthenticated users to the
    // central landing-page login rather than this tenant's own signin. Under a
    // basePath the local signin path resolves wrong (a leading-slash path drops
    // the prefix), and the hub issues a Path=/ session cookie shared by every
    // tenant on the host — so one login at the hub covers them all.
    const hubUrl = stripTrailingSlashes(process.env.AUTH_HUB_URL);
    const target = hubUrl
      ? `${hubUrl}${SIGNIN_PATH}?callbackUrl=${callbackUrl}`
      : new URL(
          `${SIGNIN_PATH}?callbackUrl=${callbackUrl}`,
          process.env.BASE_URL,
        ).toString();
    return NextResponse.redirect(target);
  }
  return NextResponse.next();
});
