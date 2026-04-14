import { APIError } from '@/lib/api/client';

/**
 * Retry handler for React Query that determines whether a failed query should be retried.
 *
 * This prevents unnecessary retries for client errors (4xx) that won't resolve with
 * repeated attempts, such as 404 Not Found, 400 Bad Request, 401 Unauthorized, etc.
 *
 * Retry behavior:
 * - Client errors (4xx): Don't retry - these are permanent errors caused by the request
 * - Server errors (5xx): Retry up to 3 times - these may be transient server issues
 * - Network errors (no status): Retry up to 3 times - these may be transient connectivity issues
 *
 * @param failureCount - The number of times the query has failed
 * @param error - The error that occurred
 * @returns true to retry, false to stop retrying
 *
 * @example
 * ```typescript
 * useQuery({
 *   queryKey: ['item', id],
 *   queryFn: () => fetchItem(id),
 *   retry: retryQueryHandler,
 * });
 * ```
 */
export function retryQueryHandler(
  failureCount: number,
  error: unknown,
): boolean {
  // Don't retry client errors (4xx) - they won't resolve with retries
  if (error instanceof APIError && error.status && error.status >= 400 && error.status < 500) {
    return false;
  }

  // Retry server errors (5xx) and network errors up to 3 times
  return failureCount < 3;
}
