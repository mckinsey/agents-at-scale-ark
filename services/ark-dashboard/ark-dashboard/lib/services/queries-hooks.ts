import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ListQueriesParams } from './queries';
import { queriesService } from './queries';
import type { components } from '@/lib/api/generated/types';

type QueryDetailResponse = components['schemas']['QueryDetailResponse'];

export const useListQueries = (params: ListQueriesParams = {}, enabled = true) => {
  return useQuery({
    queryKey: ['list-all-queries', params],
    queryFn: () => queriesService.list(params),
    placeholderData: keepPreviousData,
    enabled,
  });
};

export function useGetQuery(queryName: string | null | undefined, enabled = true) {
  return useQuery<QueryDetailResponse>({
    queryKey: ['queries', queryName],
    queryFn: () => {
      if (!queryName) {
        throw new Error('Query name is required');
      }
      return queriesService.get(queryName);
    },
    enabled: enabled && !!queryName,
    // Refetch to catch phase changes
    refetchInterval: 5000,
  });
}
