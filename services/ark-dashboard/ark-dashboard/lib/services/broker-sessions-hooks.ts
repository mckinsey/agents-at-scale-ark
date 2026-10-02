import { type UseQueryOptions, useQuery } from '@tanstack/react-query';

import { APIError } from '@/lib/api/client';

import {
  type BrokerSession,
  type SessionsListParams,
  brokerSessionsService,
} from './broker-sessions';

const SESSIONS_POLL_MS = 5000;
const MAX_TRANSIENT_RETRIES = 1;

const isNotFoundError = (error: unknown): boolean =>
  error instanceof APIError && error.status === 404;

const retryTransientErrors = (
  failureCount: number,
  error: unknown,
): boolean => {
  if (
    error instanceof APIError &&
    error.status !== undefined &&
    error.status < 500
  ) {
    return false;
  }
  return failureCount < MAX_TRANSIENT_RETRIES;
};

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
