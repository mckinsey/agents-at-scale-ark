// Re-insert the deployment base path into a pathname when it is missing.
//
// Next.js strips the configured basePath before a request reaches the auth
// route handler, but Auth.js derives its own basePath from AUTH_URL (e.g.
// /tenant-a/api/auth) and matches the incoming pathname against it. Under a
// tenant prefix the stripped /api/auth/callback/<provider> then fails Auth.js's
// action parser (UnknownAction -> 400). Realigning the inbound pathname fixes
// the callback while leaving the redirect_uri (built by Auth.js from AUTH_URL,
// already prefixed) untouched. No-op at the root or when the prefix is present.
export function prefixPathname(pathname: string, basePath: string): string {
  if (!basePath) return pathname;
  if (pathname === basePath || pathname.startsWith(`${basePath}/`)) {
    return pathname;
  }
  return `${basePath}${pathname}`;
}
