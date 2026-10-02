import { type UseQueryOptions, useQuery } from '@tanstack/react-query';

import { APIError } from '@/lib/api/client';
import { createRetryQueryHandler } from '@/lib/utils/query-retry';

import {
  type BrokerSession,
  type SessionsListParams,
  brokerSessionsService,
} from './broker-sessions';

const SESSIONS_POLL_MS = 5000;

const isNotFoundError = (error: unknown): boolean =>
  error instanceof APIError && error.status === 404;

const retryTransientErrors = createRetryQueryHandler(1);

export const useListSessions = (params?: SessionsListParams) => {
  return useQuery({
    queryKey: ['broker-sessions', params],
    queryFn: () => brokerSessionsService.getSessions(params),
    refetchInterval: SESSIONS_POLL_MS,
    retry: retryTransientErrors,
  });
};

export const useGetSession = (
  sessionId: string | null,
  options?: Partial<UseQueryOptions<BrokerSession | null>>,
) => {
  return useQuery({
    queryKey: ['broker-session', sessionId],
    queryFn: () =>
      sessionId ? brokerSessionsService.getSession(sessionId) : null,
    enabled: (options?.enabled ?? true) && !!sessionId,
    refetchInterval: query =>
      isNotFoundError(query.state.error) ? false : SESSIONS_POLL_MS,
    retry: retryTransientErrors,
    ...options,
  });
};
