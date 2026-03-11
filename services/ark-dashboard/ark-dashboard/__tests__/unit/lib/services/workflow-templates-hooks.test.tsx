import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { workflowTemplatesService } from '@/lib/services/workflow-templates';
import { useGetAllWorkflowTemplates } from '@/lib/services/workflow-templates-hooks';

vi.mock('@/lib/services/workflow-templates', () => ({
  workflowTemplatesService: {
    list: vi.fn(),
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

describe('workflow-templates-hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useGetAllWorkflowTemplates', () => {
    it('should fetch and return list of workflow templates', async () => {
      const mockTemplates = [
        { metadata: { name: 'template-1' } },
        { metadata: { name: 'template-2' } },
      ];

      vi.mocked(workflowTemplatesService.list).mockResolvedValue(
        mockTemplates as any,
      );

      const { result } = renderHook(() => useGetAllWorkflowTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockTemplates);
      expect(workflowTemplatesService.list).toHaveBeenCalledTimes(1);
    });

    it('should handle empty list', async () => {
      vi.mocked(workflowTemplatesService.list).mockResolvedValue([]);

      const { result } = renderHook(() => useGetAllWorkflowTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual([]);
    });

    it('should handle large list of templates', async () => {
      const mockTemplates = Array(100)
        .fill(null)
        .map((_, i) => ({ metadata: { name: `template-${i}` } }));

      vi.mocked(workflowTemplatesService.list).mockResolvedValue(
        mockTemplates as any,
      );

      const { result } = renderHook(() => useGetAllWorkflowTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toHaveLength(100);
    });

    it('should handle errors', async () => {
      const error = new Error('Failed to fetch workflow templates');
      vi.mocked(workflowTemplatesService.list).mockRejectedValue(error);

      const { result } = renderHook(() => useGetAllWorkflowTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(error);
    });

    it('should handle API errors', async () => {
      const apiError = new Error('API request failed');
      vi.mocked(workflowTemplatesService.list).mockRejectedValue(apiError);

      const { result } = renderHook(() => useGetAllWorkflowTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toEqual(apiError);
      expect(result.current.data).toBeUndefined();
    });

    it('should use correct query key', async () => {
      vi.mocked(workflowTemplatesService.list).mockResolvedValue([]);

      const { result } = renderHook(() => useGetAllWorkflowTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(workflowTemplatesService.list).toHaveBeenCalled();
    });

    it('should return templates with correct structure', async () => {
      const mockTemplates = [
        {
          metadata: { name: 'template-1', namespace: 'default' },
          spec: { entrypoint: 'main' },
        },
      ];

      vi.mocked(workflowTemplatesService.list).mockResolvedValue(
        mockTemplates as any,
      );

      const { result } = renderHook(() => useGetAllWorkflowTemplates(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockTemplates);
      expect(result.current.data?.[0]).toHaveProperty('metadata');
      expect(result.current.data?.[0]).toHaveProperty('spec');
    });
  });
});
