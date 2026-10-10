// Authorizations whose expiry is within this window are flagged near-expiry,
// which emphasises the Re-authenticate action on the MCP server card.
export const NEAR_EXPIRY_THRESHOLD_MS = 60 * 60 * 1000;

export function isNearExpiry(
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!expiresAt) {
    return false;
  }
  const timestamp = Date.parse(expiresAt);
  if (Number.isNaN(timestamp)) {
    return false;
  }
  return timestamp - now <= NEAR_EXPIRY_THRESHOLD_MS;
}

export function formatExpiry(expiresAt: string | null | undefined): string {
  if (!expiresAt) {
    return 'unknown';
  }
  const timestamp = Date.parse(expiresAt);
  if (Number.isNaN(timestamp)) {
    return expiresAt;
  }
  return new Date(timestamp).toLocaleString();
}
