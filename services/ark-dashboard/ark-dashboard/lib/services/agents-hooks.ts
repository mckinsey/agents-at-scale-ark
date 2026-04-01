import { useQuery } from '@tanstack/react-query';

import { agentsService } from './agents';

export const GET_ALL_AGENTS_QUERY_KEY = 'get-all-agents';

export const useGetAllAgents = () => {
  return useQuery({
    queryKey: [GET_ALL_AGENTS_QUERY_KEY],
    queryFn: agentsService.getAll,
  });
};
