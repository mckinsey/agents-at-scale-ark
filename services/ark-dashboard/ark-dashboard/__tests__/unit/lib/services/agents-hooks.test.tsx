import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/components/ui/sonner';
import { agentsService } from '@/lib/services/agents';
import {
  GET_AGENT_BY_NAME_QUERY_KEY,
  GET_ALL_AGENTS_QUERY_KEY,
  useDeleteAgent,
  useGetAgent,
  useGetAllAgents,
} from '@/lib/services/agents-hooks';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'test-namespace',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

vi.mock('@/lib/services/agents', () => ({
  agentsService: {
    list: vi.fn(),
    getByName: vi.fn(),
    deleteById: vi.fn(),
  },
}));

vi.mock('@/components/ui/sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const NAMESPACE = 'test-namespace';
const AGENT = { id: 'assistant', name: 'assistant' };

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

describe('agents-hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useGetAllAgents', () => {
    it('fetches the active namespace and keys the entry by it', async () => {
      vi.mocked(agentsService.list).mockResolvedValue([AGENT]);
      const client = createQueryClient();

      const { result } = renderHook(() => useGetAllAgents(), {
        wrapper: withClient(client),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(agentsService.list).toHaveBeenCalledWith(NAMESPACE);
      expect(
        client.getQueryData([GET_ALL_AGENTS_QUERY_KEY, NAMESPACE]),
      ).toEqual([AGENT]);
    });
  });

  describe('useGetAgent', () => {
    it('fetches by name within the namespace', async () => {
      vi.mocked(agentsService.getByName).mockResolvedValue(AGENT);
      const client = createQueryClient();

      const { result } = renderHook(() => useGetAgent('assistant'), {
        wrapper: withClient(client),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(agentsService.getByName).toHaveBeenCalledWith(
        NAMESPACE,
        'assistant',
      );
      expect(
        client.getQueryData([
          GET_AGENT_BY_NAME_QUERY_KEY,
          'assistant',
          NAMESPACE,
        ]),
      ).toEqual(AGENT);
    });

    it('does not fetch when the name is missing', async () => {
      const { result } = renderHook(() => useGetAgent(undefined), {
        wrapper: withClient(createQueryClient()),
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(agentsService.getByName).not.toHaveBeenCalled();
    });
  });

  describe('useDeleteAgent', () => {
    it('deletes in the namespace, drops the cached detail, and refreshes the list', async () => {
      vi.mocked(agentsService.deleteById).mockResolvedValue(true);
      const client = createQueryClient();
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      const remove = vi.spyOn(client, 'removeQueries');
      const onSuccess = vi.fn();

      const { result } = renderHook(() => useDeleteAgent({ onSuccess }), {
        wrapper: withClient(client),
      });
      result.current.mutate('assistant');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(agentsService.deleteById).toHaveBeenCalledWith(
        NAMESPACE,
        'assistant',
      );
      expect(remove).toHaveBeenCalledWith({
        queryKey: [GET_AGENT_BY_NAME_QUERY_KEY, 'assistant'],
      });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: [GET_ALL_AGENTS_QUERY_KEY],
      });
      expect(toast.success).toHaveBeenCalledWith('Agent deleted successfully');
      expect(onSuccess).toHaveBeenCalled();
    });

    it('reports a delete failure', async () => {
      vi.mocked(agentsService.deleteById).mockRejectedValue(new Error('Boom'));

      const { result } = renderHook(() => useDeleteAgent(), {
        wrapper: withClient(createQueryClient()),
      });
      result.current.mutate('assistant');

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith('Failed to delete Agent', {
        description: 'Boom',
      });
    });
  });
});
