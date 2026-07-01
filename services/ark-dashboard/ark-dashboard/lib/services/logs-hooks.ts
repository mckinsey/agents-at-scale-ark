import { useQuery } from '@tanstack/react-query';
import { logsService } from './logs';

export const useGetEvents = (sessionId: string | null) => {
  return useQuery({
    queryKey: ['events', sessionId],
    queryFn: () => (sessionId ? logsService.getEvents(sessionId) : null),
    enabled: !!sessionId,
  });
};
