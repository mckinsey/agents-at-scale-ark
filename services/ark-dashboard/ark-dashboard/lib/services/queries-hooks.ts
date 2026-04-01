import { useQuery } from '@tanstack/react-query';

import { queriesService } from './queries';

export const useListQueries = () => {
  return useQuery({
    queryKey: ['list-all-queries'],
    queryFn: () => queriesService.list(),
  });
};
