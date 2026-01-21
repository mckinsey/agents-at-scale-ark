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
