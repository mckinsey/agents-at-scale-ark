import { useQuery } from '@tanstack/react-query';
import { brokerSessionsService, type SessionsListParams } from './broker-sessions';

export const useListSessions = (params?: SessionsListParams) => {
  return useQuery({
    queryKey: ['broker-sessions', params],
    queryFn: () => brokerSessionsService.getSessions(params),
    refetchInterval: 5000,
  });
};

export const useGetSession = (sessionId: string | null) => {
  return useQuery({
    queryKey: ['broker-session', sessionId],
    queryFn: () => sessionId ? brokerSessionsService.getSession(sessionId) : null,
    enabled: !!sessionId,
    refetchInterval: 5000,
  });
};
