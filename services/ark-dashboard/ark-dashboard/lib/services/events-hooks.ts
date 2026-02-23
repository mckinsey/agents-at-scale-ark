import { useQuery } from '@tanstack/react-query';

import { eventsService } from './events';

export const GET_EVENTS_COUNT_QUERY_KEY = 'get-events-count';

export const useGetEventsCount = () => {
  return useQuery({
    queryKey: [GET_EVENTS_COUNT_QUERY_KEY],
    queryFn: async () => {
      const result = await eventsService.getAll({ limit: 1, page: 1 });
      return result.total;
    },
  });
};
