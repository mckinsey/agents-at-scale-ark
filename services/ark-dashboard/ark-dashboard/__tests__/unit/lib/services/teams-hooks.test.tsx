import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/components/ui/sonner';
import { teamsService } from '@/lib/services/teams';
import {
  GET_ALL_TEAMS_QUERY_KEY,
  useDeleteTeam,
  useGetAllTeams,
} from '@/lib/services/teams-hooks';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'test-namespace',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

vi.mock('@/lib/services/teams', () => ({
  teamsService: {
    list: vi.fn(),
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
const TEAM = { id: 'squad', name: 'squad' };

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

describe('teams-hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useGetAllTeams', () => {
    it('fetches the active namespace and keys the entry by it', async () => {
      vi.mocked(teamsService.list).mockResolvedValue([TEAM]);
      const client = createQueryClient();

      const { result } = renderHook(() => useGetAllTeams(), {
        wrapper: withClient(client),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(teamsService.list).toHaveBeenCalledWith(NAMESPACE);
      expect(client.getQueryData([GET_ALL_TEAMS_QUERY_KEY, NAMESPACE])).toEqual(
        [TEAM],
      );
    });
  });

  describe('useDeleteTeam', () => {
    it('deletes in the namespace and refreshes the list', async () => {
      vi.mocked(teamsService.deleteById).mockResolvedValue(true);
      const client = createQueryClient();
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      const onSuccess = vi.fn();

      const { result } = renderHook(() => useDeleteTeam({ onSuccess }), {
        wrapper: withClient(client),
      });
      result.current.mutate('squad');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(teamsService.deleteById).toHaveBeenCalledWith(NAMESPACE, 'squad');
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: [GET_ALL_TEAMS_QUERY_KEY],
      });
      expect(toast.success).toHaveBeenCalledWith('Team deleted successfully');
      expect(onSuccess).toHaveBeenCalled();
    });

    it('reports a delete failure', async () => {
      vi.mocked(teamsService.deleteById).mockRejectedValue(new Error('Boom'));

      const { result } = renderHook(() => useDeleteTeam(), {
        wrapper: withClient(createQueryClient()),
      });
      result.current.mutate('squad');

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith('Failed to delete Team', {
        description: 'Boom',
      });
    });
  });
});
