import { apiClient, APIClient } from '@/lib/api/client';

export const PAGE_LIMIT = 100;

interface PaginatedResponse<T> {
  items: T[];
  continue_token?: string | null;
}

export interface Page<T> {
  items: T[];
  continueToken: string | null;
}

/**
 * Fetch a single page of a cursor-paginated list endpoint. Callers own the
 * continuation loop; use this when the UI paginates on demand (e.g. "load
 * more" button) instead of materializing the full collection up front.
 */
export async function fetchPage<T>(
  endpoint: string,
  continueToken: string | null,
  params: Record<string, string | number | boolean> = {},
  client: APIClient = apiClient,
): Promise<Page<T>> {
  const pageParams: Record<string, string | number | boolean> = {
    ...params,
    limit: PAGE_LIMIT,
  };
  if (continueToken) {
    pageParams.continue = continueToken;
  }

  const response = await client.get<PaginatedResponse<T>>(endpoint, {
    params: pageParams,
  });

  return {
    items: response.items,
    continueToken: response.continue_token ?? null,
  };
}

/**
 * Fetch every page of a cursor-paginated list endpoint and return the
 * concatenated items. Follows the `continue_token` returned by ark-api until
 * the server reports the last page (`continue_token` null/absent).
 *
 * Pass `client` to run against the server-side API client (SSR/API routes);
 * defaults to the browser client.
 */
export async function fetchAllPages<T>(
  endpoint: string,
  params: Record<string, string | number | boolean> = {},
  client: APIClient = apiClient,
): Promise<T[]> {
  const items: T[] = [];
  let continueToken: string | null | undefined;

  do {
    const pageParams: Record<string, string | number | boolean> = {
      ...params,
      limit: PAGE_LIMIT,
    };
    if (continueToken) {
      pageParams.continue = continueToken;
    }

    const response = await client.get<PaginatedResponse<T>>(endpoint, {
      params: pageParams,
    });

    items.push(...response.items);
    continueToken = response.continue_token;
  } while (continueToken);

  return items;
}
