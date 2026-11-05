const SAFE_PROTOCOLS: readonly string[] = ['http:', 'https:'];

export function isSafeExternalUrl(
  url: string | undefined | null,
): url is string {
  if (!url) {
    return false;
  }

  try {
    return SAFE_PROTOCOLS.includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function openExternalUrl(url: string | undefined | null): void {
  if (!isSafeExternalUrl(url)) {
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
