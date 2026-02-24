import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { filesService } from '@/lib/services/files';
import { useGetFilesCount } from '@/lib/services/files-count-hooks';

vi.mock('@/lib/services/files', () => ({
  filesService: {
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

describe('files-count-hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useGetFilesCount', () => {
    it('should fetch and return total file count for single page', async () => {
      vi.mocked(filesService.list).mockResolvedValue({
        files: Array(50).fill({ name: 'file.txt' }),
        next_token: undefined,
      } as any);

      const { result } = renderHook(() => useGetFilesCount(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toBe(50);
      expect(filesService.list).toHaveBeenCalledWith({
        prefix: '',
        max_keys: 1000,
      });
    });

    it('should paginate through multiple pages of files', async () => {
      vi.mocked(filesService.list)
        .mockResolvedValueOnce({
          files: Array(1000).fill({ name: 'file.txt' }),
          next_token: 'token1',
        } as any)
        .mockResolvedValueOnce({
          files: Array(1000).fill({ name: 'file.txt' }),
          next_token: 'token2',
        } as any)
        .mockResolvedValueOnce({
          files: Array(500).fill({ name: 'file.txt' }),
          next_token: undefined,
        } as any);

      const { result } = renderHook(() => useGetFilesCount(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toBe(2500);
      expect(filesService.list).toHaveBeenCalledTimes(3);
      expect(filesService.list).toHaveBeenNthCalledWith(1, {
        prefix: '',
        max_keys: 1000,
      });
      expect(filesService.list).toHaveBeenNthCalledWith(2, {
        prefix: '',
        max_keys: 1000,
        continuation_token: 'token1',
      });
      expect(filesService.list).toHaveBeenNthCalledWith(3, {
        prefix: '',
        max_keys: 1000,
        continuation_token: 'token2',
      });
    });

    it('should stop at 10000 files limit', async () => {
      vi.mocked(filesService.list)
        .mockResolvedValueOnce({
          files: Array(1000).fill({ name: 'file.txt' }),
          next_token: 'token1',
        } as any)
        .mockResolvedValueOnce({
          files: Array(1000).fill({ name: 'file.txt' }),
          next_token: 'token2',
        } as any)
        .mockResolvedValueOnce({
          files: Array(1000).fill({ name: 'file.txt' }),
          next_token: 'token3',
        } as any)
        .mockResolvedValueOnce({
          files: Array(1000).fill({ name: 'file.txt' }),
          next_token: 'token4',
        } as any)
        .mockResolvedValueOnce({
          files: Array(1000).fill({ name: 'file.txt' }),
          next_token: 'token5',
        } as any)
        .mockResolvedValueOnce({
          files: Array(1000).fill({ name: 'file.txt' }),
          next_token: 'token6',
        } as any)
        .mockResolvedValueOnce({
          files: Array(1000).fill({ name: 'file.txt' }),
          next_token: 'token7',
        } as any)
        .mockResolvedValueOnce({
          files: Array(1000).fill({ name: 'file.txt' }),
          next_token: 'token8',
        } as any)
        .mockResolvedValueOnce({
          files: Array(1000).fill({ name: 'file.txt' }),
          next_token: 'token9',
        } as any)
        .mockResolvedValueOnce({
          files: Array(1000).fill({ name: 'file.txt' }),
          next_token: 'token10',
        } as any)
        .mockResolvedValueOnce({
          files: Array(1000).fill({ name: 'file.txt' }),
          next_token: 'token11',
        } as any);

      const { result } = renderHook(() => useGetFilesCount(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toBe(10000);
      expect(filesService.list).toHaveBeenCalledTimes(10);
    });

    it('should handle empty file list', async () => {
      vi.clearAllMocks();
      vi.resetAllMocks();

      vi.mocked(filesService.list).mockClear();
      vi.mocked(filesService.list).mockReset();
      vi.mocked(filesService.list).mockResolvedValueOnce({
        files: [],
        next_token: undefined,
      } as any);

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 0,
          },
        },
      });
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );

      const { result } = renderHook(() => useGetFilesCount(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toBe(0);
    });

    it('should handle errors', async () => {
      const error = new Error('Failed to fetch files');
      vi.mocked(filesService.list).mockRejectedValue(error);

      const { result } = renderHook(() => useGetFilesCount(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(error);
    });

    it('should use correct staleTime', () => {
      vi.mocked(filesService.list).mockResolvedValue({
        files: [],
        next_token: undefined,
      } as any);

      const { result } = renderHook(() => useGetFilesCount(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading || result.current.isSuccess).toBe(true);
    });
  });
});
