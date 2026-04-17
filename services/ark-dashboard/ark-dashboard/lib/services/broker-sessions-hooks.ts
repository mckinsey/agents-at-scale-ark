import { useQuery } from '@tanstack/react-query';
import { brokerSessionsService, type SessionsListParams } from './broker-sessions';

export const useListSessions = (params?: SessionsListParams) => {
  return useQuery({
    queryKey: ['broker-sessions', params],
    queryFn: () => brokerSessionsService.getSessions(params),
    refetchInterval: 5000,
  });
};
