import { keepPreviousData, useQuery } from '@tanstack/react-query';

import type { ListQueriesParams } from './queries';
import { queriesService } from './queries';

export const useListQueries = (params: ListQueriesParams = {}) => {
  return useQuery({
    queryKey: ['list-all-queries', params],
    queryFn: () => queriesService.list(params),
    placeholderData: keepPreviousData,
  });
};
