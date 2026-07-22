import { apiClient, APIClient } from '@/lib/api/client';

const PAGE_LIMIT = 100;

interface PaginatedResponse<T> {
  items: T[];
  continue_token?: string | null;
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
