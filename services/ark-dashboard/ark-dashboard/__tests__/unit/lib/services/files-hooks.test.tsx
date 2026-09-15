import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { filesService } from '@/lib/services/files';
import {
  useDeleteDirectory,
  useDeleteFile,
  useListFiles,
  useUploadFile,
} from '@/lib/services/files-hooks';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'test-namespace',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

vi.mock('@/lib/services/files', () => ({
  filesService: {
    list: vi.fn(),
    upload: vi.fn(),
    delete: vi.fn(),
    deleteDirectory: vi.fn(),
  },
}));

const NAMESPACE = 'test-namespace';

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const withClient = (client: QueryClient) => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe('files-hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useListFiles', () => {
    it('lists within the active namespace and keys the entry by it', async () => {
      const listing = { files: [], directories: [] };
      vi.mocked(filesService.list).mockResolvedValue(listing);
      const client = createQueryClient();
      const params = { prefix: 'docs/' };

      const { result } = renderHook(() => useListFiles(params), {
        wrapper: withClient(client),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(filesService.list).toHaveBeenCalledWith(NAMESPACE, params);
      expect(
        client.getQueryData(['list-files', params, NAMESPACE]),
      ).toEqual(listing);
    });
  });

  describe('useUploadFile', () => {
    it('uploads into the active namespace', async () => {
      vi.mocked(filesService.upload).mockResolvedValue(undefined);
      const file = new File(['x'], 'note.txt');
      const onProgress = vi.fn();

      const { result } = renderHook(() => useUploadFile(), {
        wrapper: withClient(createQueryClient()),
      });
      result.current.mutate({ file, prefix: 'docs/', onProgress });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(filesService.upload).toHaveBeenCalledWith(
        NAMESPACE,
        file,
        'docs/',
        onProgress,
      );
    });
  });

  describe('useDeleteFile', () => {
    it('deletes within the active namespace', async () => {
      vi.mocked(filesService.delete).mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteFile(), {
        wrapper: withClient(createQueryClient()),
      });
      result.current.mutate('docs/note.txt');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(filesService.delete).toHaveBeenCalledWith(
        NAMESPACE,
        'docs/note.txt',
      );
    });
  });

  describe('useDeleteDirectory', () => {
    it('deletes a prefix within the active namespace', async () => {
      vi.mocked(filesService.deleteDirectory).mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteDirectory(), {
        wrapper: withClient(createQueryClient()),
      });
      result.current.mutate('docs/');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(filesService.deleteDirectory).toHaveBeenCalledWith(
        NAMESPACE,
        'docs/',
      );
    });
  });
});
