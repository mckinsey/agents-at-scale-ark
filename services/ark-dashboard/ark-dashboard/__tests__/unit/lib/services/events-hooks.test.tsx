import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { eventsService } from '@/lib/services/events';
import { useGetEventsCount } from '@/lib/services/events-hooks';

vi.mock('@/lib/services/events', () => ({
  eventsService: {
    getAll: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('events-hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useGetEventsCount', () => {
    it('should fetch and return total events count', async () => {
      vi.mocked(eventsService.getAll).mockResolvedValue({
        items: [],
        total: 42,
      } as any);

      const { result } = renderHook(() => useGetEventsCount(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toBe(42);
      expect(eventsService.getAll).toHaveBeenCalledWith({
        limit: 1,
        page: 1,
      });
    });

    it('should return zero when total is 0', async () => {
      vi.mocked(eventsService.getAll).mockResolvedValue({
        items: [],
        total: 0,
      } as any);

      const { result } = renderHook(() => useGetEventsCount(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toBe(0);
    });

    it('should return large numbers correctly', async () => {
      vi.mocked(eventsService.getAll).mockResolvedValue({
        items: [],
        total: 999999,
      } as any);

      const { result } = renderHook(() => useGetEventsCount(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toBe(999999);
    });

    it('should handle errors', async () => {
      const error = new Error('Failed to fetch events');
      vi.mocked(eventsService.getAll).mockRejectedValue(error);

      const { result } = renderHook(() => useGetEventsCount(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(error);
    });

    it('should call eventsService.getAll only once', async () => {
      vi.mocked(eventsService.getAll).mockResolvedValue({
        items: [],
        total: 100,
      } as any);

      const { result } = renderHook(() => useGetEventsCount(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(eventsService.getAll).toHaveBeenCalledTimes(1);
    });

    it('should handle network errors', async () => {
      const error = new Error('Network error');
      vi.mocked(eventsService.getAll).mockRejectedValue(error);

      const { result } = renderHook(() => useGetEventsCount(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(error);
      expect(result.current.data).toBeUndefined();
    });
  });
});
