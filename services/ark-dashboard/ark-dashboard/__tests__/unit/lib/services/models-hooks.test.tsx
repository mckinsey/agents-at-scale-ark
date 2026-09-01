import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/components/ui/sonner';
import { modelsService } from '@/lib/services/models';
import {
  GET_ALL_MODELS_QUERY_KEY,
  GET_MODEL_BY_ID_QUERY_KEY,
  useCreateModel,
  useGetAllModels,
  useGetModelbyId,
  useUpdateModelById,
} from '@/lib/services/models-hooks';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'test-namespace',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

vi.mock('@/lib/services/models', () => ({
  modelsService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    updateById: vi.fn(),
  },
}));

vi.mock('@/components/ui/sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const NAMESPACE = 'test-namespace';
const MODEL = { id: 'gpt-4', name: 'gpt-4' };

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

describe('models-hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useGetAllModels', () => {
    it('fetches the active namespace and keys the entry by it', async () => {
      vi.mocked(modelsService.getAll).mockResolvedValue([MODEL]);
      const client = createQueryClient();

      const { result } = renderHook(() => useGetAllModels(), {
        wrapper: withClient(client),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(modelsService.getAll).toHaveBeenCalledWith(NAMESPACE);
      expect(
        client.getQueryData([GET_ALL_MODELS_QUERY_KEY, NAMESPACE]),
      ).toEqual([MODEL]);
    });
  });

  describe('useGetModelbyId', () => {
    it('fetches by id within the namespace', async () => {
      vi.mocked(modelsService.getById).mockResolvedValue(MODEL);
      const client = createQueryClient();

      const { result } = renderHook(
        () => useGetModelbyId({ modelId: 'gpt-4' }),
        { wrapper: withClient(client) },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(modelsService.getById).toHaveBeenCalledWith(NAMESPACE, 'gpt-4');
      expect(
        client.getQueryData([GET_MODEL_BY_ID_QUERY_KEY, 'gpt-4', NAMESPACE]),
      ).toEqual(MODEL);
    });

    it('reports a fetch failure', async () => {
      vi.mocked(modelsService.getById).mockRejectedValue(new Error('Boom'));

      const { result } = renderHook(
        () => useGetModelbyId({ modelId: 'gpt-4' }),
        { wrapper: withClient(createQueryClient()) },
      );

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith('Failed to get Model: gpt-4', {
        description: 'Boom',
      });
    });
  });

  describe('useCreateModel', () => {
    it('creates in the namespace and refreshes the list', async () => {
      vi.mocked(modelsService.create).mockResolvedValue(MODEL);
      const client = createQueryClient();
      const invalidate = vi.spyOn(client, 'invalidateQueries');
      const onSuccess = vi.fn();

      const { result } = renderHook(() => useCreateModel({ onSuccess }), {
        wrapper: withClient(client),
      });
      result.current.mutate({ name: 'gpt-4' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(modelsService.create).toHaveBeenCalledWith(NAMESPACE, {
        name: 'gpt-4',
      });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: [GET_ALL_MODELS_QUERY_KEY],
      });
      expect(toast.success).toHaveBeenCalledWith('Model created successfully');
      expect(onSuccess).toHaveBeenCalled();
    });

    it('reports a create failure', async () => {
      vi.mocked(modelsService.create).mockRejectedValue(new Error('Conflict'));

      const { result } = renderHook(() => useCreateModel(), {
        wrapper: withClient(createQueryClient()),
      });
      result.current.mutate({ name: 'gpt-4' });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to create Model: gpt-4',
        { description: 'Conflict' },
      );
    });
  });

  describe('useUpdateModelById', () => {
    it('updates in the namespace and refreshes both the list and the entry', async () => {
      vi.mocked(modelsService.updateById).mockResolvedValue(MODEL);
      const client = createQueryClient();
      const invalidate = vi.spyOn(client, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateModelById(), {
        wrapper: withClient(client),
      });
      result.current.mutate({ id: 'gpt-4', model: 'gpt-4o' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(modelsService.updateById).toHaveBeenCalledWith(
        NAMESPACE,
        'gpt-4',
        { model: 'gpt-4o' },
      );
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: [GET_ALL_MODELS_QUERY_KEY],
      });
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: [GET_MODEL_BY_ID_QUERY_KEY, 'gpt-4'],
      });
    });

    it('reports an update failure', async () => {
      vi.mocked(modelsService.updateById).mockRejectedValue(
        new Error('Rejected'),
      );

      const { result } = renderHook(() => useUpdateModelById(), {
        wrapper: withClient(createQueryClient()),
      });
      result.current.mutate({ id: 'gpt-4' });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to update Model: gpt-4',
        { description: 'Rejected' },
      );
    });
  });
});
