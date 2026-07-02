import { FEDERATED_SIGNOUT_PATH } from '../constants/auth';

// Strip trailing slashes without a regex (avoids Sonar S5852 ReDoS heuristics).
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charAt(end - 1) === '/') end -= 1;
  return value.slice(0, end);
}

// Full-page navigation to the federated sign-out route.
//  - window.location uses an absolute path, which Next.js does NOT auto-prefix
//    with basePath — so under a tenant prefix (e.g. /tenant-a) we must prepend it
//    or the request drops the prefix and 404s.
//  - When NEXT_PUBLIC_AUTH_HUB_URL is set, sign out at the central hub, which owns
//    the shared Path=/ session cookie — mirroring the hub login so one logout
//    covers every tenant.
export function signout() {
  const hub = process.env.NEXT_PUBLIC_AUTH_HUB_URL;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const prefix = hub ? stripTrailingSlashes(hub) : basePath;
  window.location.href = `${prefix}${FEDERATED_SIGNOUT_PATH}`;
}
