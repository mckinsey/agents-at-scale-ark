import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { brokerSessionsService } from '@/lib/services/broker-sessions';
import { useListSessions, useGetSession } from '@/lib/services/broker-sessions-hooks';
import type { BrokerSession, PaginatedSessions } from '@/lib/services/broker-sessions';

vi.mock('@/lib/services/broker-sessions', () => ({
  brokerSessionsService: {
    getSessions: vi.fn(),
    getSession: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchInterval: false,
      },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('broker-sessions hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useListSessions', () => {
    it('should fetch sessions without params', async () => {
      const mockResponse: PaginatedSessions = {
        items: [
          {
            sessionId: 'session-1',
            name: 'Test Session',
            status: 'active',
            errorCount: 0,
            participants: [],
            conversationCount: 2,
            createdAt: '2024-01-01T00:00:00Z',
            lastActivity: '2024-01-01T01:00:00Z',
          },
        ],
        total: 1,
        hasMore: false,
      };

      vi.mocked(brokerSessionsService.getSessions).mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useListSessions(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockResponse);
      expect(brokerSessionsService.getSessions).toHaveBeenCalledWith(undefined);
    });

    it('should pass params to service', async () => {
      const mockResponse: PaginatedSessions = {
        items: [],
        total: 0,
        hasMore: false,
      };

      vi.mocked(brokerSessionsService.getSessions).mockResolvedValue(mockResponse);

      const params = {
        limit: 20,
        status: 'active' as const,
        search: 'test',
      };

      const { result } = renderHook(() => useListSessions(params), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(brokerSessionsService.getSessions).toHaveBeenCalledWith(params);
    });

    it('should handle errors', async () => {
      const error = new Error('Failed to fetch sessions');
      vi.mocked(brokerSessionsService.getSessions).mockRejectedValue(error);

      const { result } = renderHook(() => useListSessions(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(error);
    });

    it('should use correct query key with params', async () => {
      const mockResponse: PaginatedSessions = {
        items: [],
        total: 0,
        hasMore: false,
      };

      vi.mocked(brokerSessionsService.getSessions).mockResolvedValue(mockResponse);

      const params = { limit: 10 };

      const { result } = renderHook(() => useListSessions(params), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockResponse);
    });
  });

  describe('useGetSession', () => {
    it('should fetch a single session by ID', async () => {
      const mockSession: BrokerSession = {
        sessionId: 'session-1',
        name: 'Test Session',
        status: 'active',
        errorCount: 0,
        participants: [],
        conversationCount: 2,
        createdAt: '2024-01-01T00:00:00Z',
        lastActivity: '2024-01-01T01:00:00Z',
      };

      vi.mocked(brokerSessionsService.getSession).mockResolvedValue(mockSession);

      const { result } = renderHook(() => useGetSession('session-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockSession);
      expect(brokerSessionsService.getSession).toHaveBeenCalledWith('session-1');
    });

    it('should not fetch when sessionId is null', async () => {
      vi.mocked(brokerSessionsService.getSession).mockResolvedValue(null);

      const { result } = renderHook(() => useGetSession(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.isFetching).toBe(false);
      expect(brokerSessionsService.getSession).not.toHaveBeenCalled();
    });

    it('should respect enabled option', async () => {
      vi.mocked(brokerSessionsService.getSession).mockResolvedValue(null);

      const { result } = renderHook(
        () => useGetSession('session-1', { enabled: false }),
        {
          wrapper: createWrapper(),
        }
      );

      expect(result.current.isFetching).toBe(false);
      expect(brokerSessionsService.getSession).not.toHaveBeenCalled();
    });

    it('should only fetch when both enabled and sessionId are truthy', async () => {
      vi.mocked(brokerSessionsService.getSession).mockResolvedValue(null);

      const { result: result1 } = renderHook(
        () => useGetSession(null, { enabled: true }),
        {
          wrapper: createWrapper(),
        }
      );

      await waitFor(() => expect(result1.current.isFetching).toBe(false));

      const { result: result2 } = renderHook(
        () => useGetSession('session-1', { enabled: false }),
        {
          wrapper: createWrapper(),
        }
      );

      await waitFor(() => expect(result2.current.isFetching).toBe(false));
      expect(brokerSessionsService.getSession).not.toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      const error = new Error('Failed to fetch session');
      vi.mocked(brokerSessionsService.getSession).mockRejectedValue(error);

      const { result } = renderHook(() => useGetSession('session-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(error);
    });

    it('should return null when session not found', async () => {
      vi.mocked(brokerSessionsService.getSession).mockResolvedValue(null);

      const { result } = renderHook(() => useGetSession('non-existent'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toBeNull();
    });
  });
});
