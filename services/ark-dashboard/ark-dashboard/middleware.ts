import { NextResponse } from 'next/server';

import { auth, type NextRequestWithAuth } from './auth';
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

export default auth(async (req: NextRequestWithAuth) => {
  const { pathname } = req.nextUrl;

  if (
    pathname === '/favicon.ico' ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  if (!req.auth && pathname !== SIGNIN_PATH) {
    const signInUrl = new URL(
      `${SIGNIN_PATH}?callbackUrl=${encodeURIComponent(req.nextUrl.href)}`,
      process.env.BASE_URL,
    );
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
});
