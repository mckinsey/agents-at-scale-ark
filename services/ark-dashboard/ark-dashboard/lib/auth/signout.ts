import { FEDERATED_SIGNOUT_PATH } from '../constants/auth';

// Full-page navigation to the federated sign-out route.
//
// window.location uses an absolute path, which Next.js does NOT auto-prefix with
// basePath — so under a tenant prefix (e.g. /tenant-a) we must prepend
// NEXT_PUBLIC_BASE_PATH or the request drops the prefix and 404s.
//
// Whether logout then redirects to the central hub is decided *server-side* in
// the federated-signout route (via AUTH_HUB_URL), so the client needs no hub URL
// of its own. That keeps a single, runtime-configurable server env var and avoids
// a login-vs-logout mismatch. (A client-side NEXT_PUBLIC_* value would also be
// baked at build time here, since only the basePath sentinel is substituted at
// container start.)
export function signout() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  window.location.href = `${basePath}${FEDERATED_SIGNOUT_PATH}`;
}
