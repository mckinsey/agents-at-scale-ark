import type {
  QueryDetailResponse,
  QueryListResponse,
  QueryResponse,
} from '@/lib/services/chat';

export function queryDetail(
  overrides: Partial<QueryDetailResponse> = {},
): QueryDetailResponse {
  return {
    name: 'test-query',
    namespace: 'default',
    type: 'user',
    input: 'test input',
    ...overrides,
  };
}

export function queryResponse(
  overrides: Partial<QueryResponse> = {},
): QueryResponse {
  return {
    name: 'test-query',
    namespace: 'default',
    type: 'user',
    input: 'test input',
    ...overrides,
  };
}

export function queryList(items: QueryResponse[]): QueryListResponse {
  return {
    items,
    count: items.length,
    total: items.length,
    page: 1,
    page_size: items.length,
  };
}
