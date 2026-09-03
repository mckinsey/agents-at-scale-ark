import { useQuery } from '@tanstack/react-query';

import { useNamespace } from '@/providers/NamespaceProvider';

import { agentsService } from './agents';

export const GET_ALL_AGENTS_QUERY_KEY = 'get-all-agents';

export const useGetAllAgents = () => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_ALL_AGENTS_QUERY_KEY, namespace],
    queryFn: () => agentsService.list(namespace),
    enabled: Boolean(namespace),
  });
};
