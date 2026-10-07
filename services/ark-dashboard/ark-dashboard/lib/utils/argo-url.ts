export function normalizeArgoUrl(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim().replace(/\/+$/, '');
  return trimmed || undefined;
}
