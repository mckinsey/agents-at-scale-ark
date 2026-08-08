import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useNamespace } from '@/providers/NamespaceProvider';

import type { ListQueriesParams } from './queries';
import { queriesService } from './queries';
import type { components } from '@/lib/api/generated/types';

type QueryDetailResponse = components['schemas']['QueryDetailResponse'];

export const useListQueries = (params: ListQueriesParams = {}, enabled = true) => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: ['list-all-queries', params, namespace],
    queryFn: () => queriesService.list(namespace, params),
    placeholderData: keepPreviousData,
    enabled: enabled && Boolean(namespace),
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
