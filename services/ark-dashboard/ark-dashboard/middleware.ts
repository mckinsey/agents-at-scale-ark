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

// Under a tenant prefix, Next.js does not reliably strip the configured
// basePath from req.nextUrl.pathname in middleware, so the request arrives as
// e.g. /tenant-a/api/auth/signin. The public/sign-in allow-list below is
// expressed with root-absolute paths, so we must normalise the pathname first
// or /tenant-a/api/auth/signin fails startsWith('/api/auth') and !== SIGNIN_PATH,
// and the gate redirects the sign-in route to itself forever. No-op when Next
// already stripped the prefix, or when NEXT_PUBLIC_BASE_PATH is unset (root
// hosting). Same env var the api-url helper uses; substituted at container start.
function stripBasePath(pathname: string, basePath: string): string {
  if (!basePath) return pathname;
  if (pathname === basePath) return '/';
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length);
  return pathname;
}

export default auth(async (req: NextRequestWithAuth) => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const pathname = stripBasePath(req.nextUrl.pathname, basePath);

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
    //
    // Both branches concatenate onto the (hub or tenant) base URL rather than
    // using `new URL(SIGNIN_PATH, base)`: SIGNIN_PATH is root-absolute, so
    // `new URL` would discard the base's path segment and drop the tenant
    // prefix (e.g. https://host/tenant-a -> https://host/api/auth/signin).
    const hubUrl = stripTrailingSlashes(process.env.AUTH_HUB_URL);
    const baseUrl = stripTrailingSlashes(process.env.BASE_URL) ?? '';
    const target = hubUrl
      ? `${hubUrl}${SIGNIN_PATH}?callbackUrl=${callbackUrl}`
      : `${baseUrl}${SIGNIN_PATH}?callbackUrl=${callbackUrl}`;
    return NextResponse.redirect(target);
  }
  return NextResponse.next();
});
