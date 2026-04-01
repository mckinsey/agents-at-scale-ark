import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { a2aTasksService } from '@/lib/services/a2a-tasks';
import { useA2ATask, useListA2ATasks } from '@/lib/services/a2a-tasks-hooks';

vi.mock('@/lib/services/a2a-tasks', () => ({
  a2aTasksService: {
    getAll: vi.fn(),
    get: vi.fn(),
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
  // eslint-disable-next-line react/display-name
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('a2a-tasks hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useListA2ATasks', () => {
    it('should fetch and return list of tasks', async () => {
      const mockTasks = [
        { id: 'task-1', name: 'task-1', phase: 'completed' },
        { id: 'task-2', name: 'task-2', phase: 'running' },
      ];

      vi.mocked(a2aTasksService.getAll).mockResolvedValue(mockTasks as any);

      const { result } = renderHook(() => useListA2ATasks(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual({ items: mockTasks, count: 2 });
      expect(a2aTasksService.getAll).toHaveBeenCalledTimes(1);
    });

    it('should handle errors', async () => {
      const error = new Error('Failed to fetch');
      vi.mocked(a2aTasksService.getAll).mockRejectedValue(error);

      const { result } = renderHook(() => useListA2ATasks(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(error);
    });
  });

  describe('useA2ATask', () => {
    it('should fetch and return a single task', async () => {
      const mockTask = { id: 'task-1', name: 'task-1', phase: 'completed' };
      vi.mocked(a2aTasksService.get).mockResolvedValue(mockTask as any);

      const { result } = renderHook(() => useA2ATask('task-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockTask);
      expect(a2aTasksService.get).toHaveBeenCalledWith('task-1');
    });

    it('should handle errors', async () => {
      const error = new Error('Failed to fetch task');
      vi.mocked(a2aTasksService.get).mockRejectedValue(error);

      const { result } = renderHook(() => useA2ATask('task-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(error);
    });
  });
});
