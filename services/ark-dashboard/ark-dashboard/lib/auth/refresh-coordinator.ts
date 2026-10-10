import type { JWT } from '@auth/core/jwt';

import { TokenManager } from './token-manager';

const EXPIRY_SKEW_SECONDS = 30;
const RESULT_TTL_MS = 60_000;

type Entry = {
  promise: Promise<JWT>;
  expiresAt: number;
};

const inFlight = new Map<string, Entry>();

function prune(now: number) {
  for (const [key, entry] of inFlight) {
    if (entry.expiresAt <= now) inFlight.delete(key);
  }
}

export function isAccessTokenExpiring(
  token: Pick<JWT, 'expires_at'>,
  nowMs: number = Date.now(),
): boolean {
  if (typeof token.expires_at !== 'number') return false;
  return nowMs / 1000 >= token.expires_at - EXPIRY_SKEW_SECONDS;
}

export function refreshAccessToken(token: JWT): Promise<JWT> {
  const key = token.refresh_token;
  if (!key) return TokenManager.getNewAccessToken(token);

  const now = Date.now();
  prune(now);

  const cached = inFlight.get(key);
  if (cached) return cached.promise;

  const promise = TokenManager.getNewAccessToken(token);
  const entry: Entry = { promise, expiresAt: Number.MAX_SAFE_INTEGER };
  inFlight.set(key, entry);

  promise.then(
    () => {
      if (inFlight.get(key) === entry) {
        entry.expiresAt = Date.now() + RESULT_TTL_MS;
      }
    },
    () => {
      if (inFlight.get(key) === entry) inFlight.delete(key);
    },
  );

  return promise;
}

export function resetRefreshCoordinator() {
  inFlight.clear();
}
