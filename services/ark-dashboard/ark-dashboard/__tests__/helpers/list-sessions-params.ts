import { vi } from 'vitest';

import type { SessionsListParams } from '@/lib/services/broker-sessions';
import { useListSessions } from '@/lib/services/broker-sessions-hooks';

export function lastListSessionsParams(): SessionsListParams {
  const calls = vi.mocked(useListSessions).mock.calls;
  const params = calls[calls.length - 1]?.[0];

  if (!params) {
    throw new Error('useListSessions was not called with parameters');
  }

  return params;
}

export function lastListSessionsDateFrom(): number {
  const { dateFrom } = lastListSessionsParams();

  if (!dateFrom) {
    throw new Error('useListSessions was not called with dateFrom');
  }

  return new Date(dateFrom).getTime();
}
