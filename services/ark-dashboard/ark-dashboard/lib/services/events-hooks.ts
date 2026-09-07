import { useQuery } from '@tanstack/react-query';

import { useNamespace } from '@/providers/NamespaceProvider';

import { eventsService } from './events';

export const GET_EVENTS_COUNT_QUERY_KEY = 'get-events-count';

export const useGetEventsCount = () => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_EVENTS_COUNT_QUERY_KEY, namespace],
    queryFn: async () => {
      const result = await eventsService.getAll(namespace, {
        limit: 1,
        page: 1,
      });
      return result.total;
    },
    enabled: Boolean(namespace),
  });
};
