import { useQuery } from '@tanstack/react-query';

import { memoryService } from './memory';

export const GET_MEMORY_RESOURCES_QUERY_KEY = 'get-all-models';

export const useGetMemoryResources = () => {
  return useQuery({
    queryKey: [GET_MEMORY_RESOURCES_QUERY_KEY],
    queryFn: memoryService.getMemoryResources,
  });
};
