const UNIT_TO_MS: Record<string, number> = {
  ns: 1 / 1_000_000,
  us: 1 / 1_000,
  µs: 1 / 1_000,
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 60 * 60_000,
  d: 24 * 60 * 60_000,
};

/**
 * Parses a Go-style duration string ("5m", "30s", "1h30m") into milliseconds.
 * Returns null if the string is missing or unparseable.
 */
export function parseDurationToMs(
  duration: string | null | undefined,
): number | null {
  if (!duration) return null;
  const trimmed = duration.trim();
  if (trimmed === '') return null;

  // Anchored, single-token regex consumed against a shrinking string. Matching
  // only ever starts at position 0 of `rest`, so total work is linear in the
  // input length (no global rescan that would make it super-linear).
  const token = /^(-?\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h|d)/;
  let rest = trimmed;
  let total = 0;
  while (rest.length > 0) {
    const match = token.exec(rest);
    if (!match) return null;
    const value = Number.parseFloat(match[1]);
    const factor = UNIT_TO_MS[match[2]];
    if (factor === undefined || Number.isNaN(value)) return null;
    total += value * factor;
    rest = rest.slice(match[0].length);
  }
  return total;
}

/**
 * Simplifies Kubernetes duration strings by removing trailing zero units
 * Examples: "5m0s" → "5m", "720h0m0s" → "720h", "1h30m0s" → "1h30m"
 */
export function simplifyDuration(duration: string | null | undefined): string {
  if (!duration) return '-';

  // Remove trailing zero units (match only valid Kubernetes duration units)
  const simplified = duration
    .replace(/([yhdhms])0s$/, '$1') // Remove trailing "0s" when preceded by a duration unit
    .replace(/([yhdhms])0m$/, '$1'); // Remove trailing "0m" when preceded by a duration unit

  // Return simplified version, or original if it becomes empty
  return simplified || duration;
}

/**
 * Formats a timestamp to a Kubernetes-style age format
 * Examples: "12m", "3h5m", "2d1h", "5d"
 */
export function formatAge(timestamp: Date | string | null | undefined): string {
  if (!timestamp) return '-';

  try {
    const date = new Date(timestamp);

    // Check if the date is invalid
    if (isNaN(date.getTime())) {
      return '-';
    }

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    // Handle negative differences (future dates)
    if (diffMs < 0) return 'now';

    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Less than 1 minute
    if (diffMins < 1) return 'now';

    // Less than 1 hour: show minutes only
    if (diffMins < 60) return `${diffMins}m`;

    // Less than 1 day: show hours and minutes
    if (diffHours < 24) {
      const remainingMins = diffMins % 60;
      if (remainingMins === 0) return `${diffHours}h`;
      return `${diffHours}h${remainingMins}m`;
    }

    // Less than 1 week: show days and hours
    if (diffDays < 7) {
      const remainingHours = diffHours % 24;
      if (remainingHours === 0) return `${diffDays}d`;
      return `${diffDays}d${remainingHours}h`;
    }

    // More than a week: show full date
    return date.toLocaleDateString();
  } catch {
    return '-';
  }
}
