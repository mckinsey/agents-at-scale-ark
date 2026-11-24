import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/components/ui/sonner';
import { mcpServersService } from '@/lib/services/mcp-servers';
import {
  GET_ALL_MCP_SERVERS_QUERY_KEY,
  useDeleteMcpServer,
  useGetAllMcpServers,
} from '@/lib/services/mcp-servers-hooks';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'test-namespace',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

vi.mock('@/lib/services/mcp-servers', () => ({
  mcpServersService: {
    getAll: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/components/ui/sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const NAMESPACE = 'test-namespace';
const SERVER = { id: 'filesystem', name: 'filesystem' };

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

describe('mcp-servers-hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useGetAllMcpServers', () => {
    it('fetches the active namespace and keys the entry by it', async () => {
      vi.mocked(mcpServersService.getAll).mockResolvedValue([SERVER]);
      const client = createQueryClient();

      const { result } = renderHook(() => useGetAllMcpServers(), {
        wrapper: withClient(client),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mcpServersService.getAll).toHaveBeenCalledWith(NAMESPACE);
      expect(
        client.getQueryData([GET_ALL_MCP_SERVERS_QUERY_KEY, NAMESPACE]),
      ).toEqual([SERVER]);
    });
  });

  describe('useDeleteMcpServer', () => {
    it('deletes in the namespace and refreshes the list', async () => {
      vi.mocked(mcpServersService.delete).mockResolvedValue(undefined);
      const client = createQueryClient();
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      const onSuccess = vi.fn();

      const { result } = renderHook(() => useDeleteMcpServer({ onSuccess }), {
        wrapper: withClient(client),
      });
      result.current.mutate('filesystem');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(mcpServersService.delete).toHaveBeenCalledWith(
        NAMESPACE,
        'filesystem',
      );
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: [GET_ALL_MCP_SERVERS_QUERY_KEY],
      });
      expect(toast.success).toHaveBeenCalledWith(
        'MCP Server deleted successfully',
      );
      expect(onSuccess).toHaveBeenCalled();
    });

    it('reports a delete failure', async () => {
      vi.mocked(mcpServersService.delete).mockRejectedValue(new Error('Boom'));

      const { result } = renderHook(() => useDeleteMcpServer(), {
        wrapper: withClient(createQueryClient()),
      });
      result.current.mutate('filesystem');

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith('Failed to delete MCP Server', {
        description: 'Boom',
      });
    });
  });
});
