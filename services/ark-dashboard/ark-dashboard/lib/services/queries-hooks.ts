import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useNamespace } from '@/providers/NamespaceProvider';

import type { ListQueriesParams } from './queries';
import { queriesService } from './queries';
import type { components } from '@/lib/api/generated/types';
import { NON_TERMINAL_QUERY_STATUS_PHASES } from '@/lib/services/chat';

type QueryDetailResponse = components['schemas']['QueryDetailResponse'];
type QueryListResponse = components['schemas']['QueryListResponse'];

const ACTIVE_QUERIES_POLL_INTERVAL_MS = 5000;

const hasActiveQueries = (data: QueryListResponse | undefined) =>
  Boolean(
    data?.items.some(query => {
      const phase = query.status?.phase;
      return (
        typeof phase !== 'string' ||
        (NON_TERMINAL_QUERY_STATUS_PHASES as readonly string[]).includes(phase)
      );
    }),
  );

export const LIST_ALL_QUERIES_QUERY_KEY = 'list-all-queries';

export const useListQueries = (params: ListQueriesParams = {}, enabled = true) => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [LIST_ALL_QUERIES_QUERY_KEY, params, namespace],
    queryFn: () => queriesService.list(namespace, params),
    enabled: enabled && Boolean(namespace),
    refetchInterval: query =>
      hasActiveQueries(query.state.data)
        ? ACTIVE_QUERIES_POLL_INTERVAL_MS
        : false,
  });
};

export function useGetQuery(queryName: string | null | undefined, enabled = true) {
  const { namespace } = useNamespace();

  return useQuery<QueryDetailResponse>({
    queryKey: ['queries', queryName, namespace],
    queryFn: () => {
      if (!queryName) {
        throw new Error('Query name is required');
      }
      return queriesService.get(namespace, queryName);
    },
    enabled: enabled && !!queryName && Boolean(namespace),
    // Refetch to catch phase changes
    refetchInterval: 5000,
  });
}

export const useInvalidateQueriesList = () => {
  const queryClient = useQueryClient();

  return useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: [LIST_ALL_QUERIES_QUERY_KEY],
      }),
    [queryClient],
  );
};
