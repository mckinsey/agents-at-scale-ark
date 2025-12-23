/**
 * A paginated list response envelope.
 * Uses cursor-based pagination with sequence numbers for consistent results
 * even as new items are added to the stream.
 *
 * @template T - The type of items in the list
 *
 * @example
 * // First page request: GET /events?limit=50
 * // Response:
 * {
 *   items: [...],
 *   total: 150,
 *   hasMore: true,
 *   nextCursor: 51
 * }
 *
 * // Next page: GET /events?limit=50&cursor=51
 * // Watch from cursor: GET /events?watch=true&cursor=51
 */
export interface PaginatedList<T> {
  /** The items in this page of results */
  items: T[];
  /** Total number of items matching the query (across all pages) */
  total: number;
  /** Whether more items exist beyond this page */
  hasMore: boolean;
  /** Cursor for fetching the next page, or for starting a watch stream */
  nextCursor?: number;
}

/**
 * Query parameters for pagination.
 */
export interface PaginationParams {
  /** Maximum number of items to return (default: 100, max: 1000) */
  limit: number;
  /** Sequence number to start from (exclusive - returns items after this cursor) */
  cursor?: number;
}

/** Default number of items per page */
export const DEFAULT_LIMIT = 100;

/** Maximum allowed items per page */
export const MAX_LIMIT = 1000;

/**
 * Error thrown when pagination parameters are invalid.
 */
export class PaginationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaginationError';
  }
}

/**
 * Parse and validate pagination parameters from query string.
 * Throws PaginationError if parameters are invalid.
 *
 * @param query - Express request query object
 * @returns Validated pagination parameters
 * @throws {PaginationError} If limit or cursor values are invalid
 */
export function parsePaginationParams(query: Record<string, unknown>): PaginationParams {
  let limit = DEFAULT_LIMIT;
  let cursor: number | undefined;

  if (query['limit'] !== undefined) {
    const parsed = parseInt(query['limit'] as string, 10);
    if (isNaN(parsed) || parsed < 1) {
      throw new PaginationError('limit must be a positive integer');
    }
    if (parsed > MAX_LIMIT) {
      throw new PaginationError(`limit cannot exceed ${MAX_LIMIT}`);
    }
    limit = parsed;
  }

  if (query['cursor'] !== undefined) {
    const parsed = parseInt(query['cursor'] as string, 10);
    if (isNaN(parsed) || parsed < 0) {
      throw new PaginationError('cursor must be a non-negative integer');
    }
    cursor = parsed;
  }

  return { limit, cursor };
}
