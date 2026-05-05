import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { brokerSessionsService, type SessionsListParams, type BrokerSession } from './broker-sessions';

export const useListSessions = (params?: SessionsListParams) => {
  return useQuery({
    queryKey: ['broker-sessions', params],
    queryFn: () => brokerSessionsService.getSessions(params),
    refetchInterval: 5000,
  });
};

export const useGetSession = (
  sessionId: string | null,
  options?: Partial<UseQueryOptions<BrokerSession | null>>
) => {
  return useQuery({
    queryKey: ['broker-session', sessionId],
    queryFn: () => sessionId ? brokerSessionsService.getSession(sessionId) : null,
    enabled: (options?.enabled ?? true) && !!sessionId,
    refetchInterval: 5000,
    ...options,
  });
};
