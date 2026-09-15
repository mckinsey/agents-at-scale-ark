import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/components/ui/sonner';
import { APIError } from '@/lib/api/client';
import { secretsService } from '@/lib/services/secrets';
import type {
  Secret,
  SecretCreateRequest,
  SecretDetailResponse,
  SecretUpdateRequest,
} from '@/lib/services/secrets';
import {
  GET_ALL_SECRETS_QUERY_KEY,
  GET_SECRET_QUERY_KEY,
  useCreateSecret,
  useDeleteSecret,
  useGetAllSecrets,
  useGetSecret,
  useUpdateSecret,
} from '@/lib/services/secrets-hooks';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'default',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

vi.mock('@/lib/services/secrets', () => ({
  secretsService: {
    getAll: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/components/ui/sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const wrapperFor = (queryClient: QueryClient) => {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const createWrapper = () => wrapperFor(createQueryClient());

const secret: Secret = {
  id: 'aws-credentials',
  name: 'aws-credentials',
  description: null,
  alias: null,
  labels: [],
};

const secretDetail: SecretDetailResponse = {
  id: 'aws-credentials',
  name: 'aws-credentials',
  type: 'Opaque',
  keys: ['token'],
  description: null,
  alias: null,
  labels: [],
};

const createRequest: SecretCreateRequest = {
  name: 'aws-credentials',
  string_data: { token: 'password123' },
  type: 'Opaque',
  labels: [],
};

const updateRequest: SecretUpdateRequest = {
  string_data: { token: 'newpassword123' },
  labels: [],
};

describe('secrets-hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useGetAllSecrets', () => {
    it('should fetch all secrets', async () => {
      vi.mocked(secretsService.getAll).mockResolvedValue([secret]);

      const { result } = renderHook(() => useGetAllSecrets(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual([secret]);
      expect(secretsService.getAll).toHaveBeenCalledTimes(1);
    });

    it('should surface fetch errors', async () => {
      const error = new Error('Failed to fetch');
      vi.mocked(secretsService.getAll).mockRejectedValue(error);

      const { result } = renderHook(() => useGetAllSecrets(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(error);
    });
  });

  describe('useGetSecret', () => {
    it('should fetch the secret when a name is provided', async () => {
      vi.mocked(secretsService.get).mockResolvedValue(secretDetail);

      const { result } = renderHook(() => useGetSecret('aws-credentials'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(secretsService.get).toHaveBeenCalledWith(
        'default',
        'aws-credentials',
      );
      expect(result.current.data).toEqual(secretDetail);
    });

    it('should not fetch when the name is undefined', () => {
      const { result } = renderHook(() => useGetSecret(undefined), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(secretsService.get).not.toHaveBeenCalled();
    });

    it('should surface fetch errors', async () => {
      const error = new Error('Failed to fetch secret');
      vi.mocked(secretsService.get).mockRejectedValue(error);

      const { result } = renderHook(() => useGetSecret('aws-credentials'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(error);
    });
  });

  describe('useCreateSecret', () => {
    it('should create a secret and notify the caller', async () => {
      vi.mocked(secretsService.create).mockResolvedValue(secretDetail);

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useCreateSecret({ onSuccess }), {
        wrapper: createWrapper(),
      });

      result.current.mutate(createRequest);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(secretsService.create).toHaveBeenCalledWith(
        'default',
        createRequest,
      );
      expect(toast.success).toHaveBeenCalledWith('Secret created successfully');
      expect(onSuccess).toHaveBeenCalledWith(secretDetail);
    });

    it('should report a name clash on 409', async () => {
      vi.mocked(secretsService.create).mockRejectedValue(
        new APIError('Conflict', 409),
      );

      const { result } = renderHook(() => useCreateSecret(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(createRequest);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to create Secret: aws-credentials',
        {
          description:
            'A Secret with the name "aws-credentials" already exists.',
        },
      );
    });

    it('should fall back to the error message on other failures', async () => {
      vi.mocked(secretsService.create).mockRejectedValue(
        new Error('Network error'),
      );

      const { result } = renderHook(() => useCreateSecret(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(createRequest);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to create Secret: aws-credentials',
        { description: 'Network error' },
      );
    });

    it('should invalidate the list once settled', async () => {
      vi.mocked(secretsService.create).mockResolvedValue(secretDetail);

      const queryClient = createQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateSecret(), {
        wrapper: wrapperFor(queryClient),
      });

      result.current.mutate(createRequest);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [GET_ALL_SECRETS_QUERY_KEY],
      });
    });
  });

  describe('useUpdateSecret', () => {
    it('should update a secret and notify the caller', async () => {
      vi.mocked(secretsService.update).mockResolvedValue(secretDetail);

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useUpdateSecret({ onSuccess }), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ name: 'aws-credentials', request: updateRequest });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(secretsService.update).toHaveBeenCalledWith(
        'default',
        'aws-credentials',
        updateRequest,
      );
      expect(toast.success).toHaveBeenCalledWith('Secret updated successfully');
      expect(onSuccess).toHaveBeenCalledWith(secretDetail);
    });

    it('should report a missing secret on 404', async () => {
      vi.mocked(secretsService.update).mockRejectedValue(
        new APIError('Not Found', 404),
      );

      const { result } = renderHook(() => useUpdateSecret(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ name: 'gone', request: updateRequest });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith('Failed to update Secret: gone', {
        description: 'Secret "gone" not found.',
      });
    });

    it('should fall back to the error message on other failures', async () => {
      vi.mocked(secretsService.update).mockRejectedValue(
        new Error('Update failed'),
      );

      const { result } = renderHook(() => useUpdateSecret(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ name: 'aws-credentials', request: updateRequest });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to update Secret: aws-credentials',
        { description: 'Update failed' },
      );
    });

    it('should invalidate both the list and the updated secret', async () => {
      vi.mocked(secretsService.update).mockResolvedValue(secretDetail);

      const queryClient = createQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateSecret(), {
        wrapper: wrapperFor(queryClient),
      });

      result.current.mutate({ name: 'aws-credentials', request: updateRequest });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [GET_ALL_SECRETS_QUERY_KEY],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [GET_SECRET_QUERY_KEY, 'aws-credentials'],
      });
    });
  });

  describe('useDeleteSecret', () => {
    it('should delete a secret and notify the caller', async () => {
      vi.mocked(secretsService.delete).mockResolvedValue(undefined);

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useDeleteSecret({ onSuccess }), {
        wrapper: createWrapper(),
      });

      result.current.mutate('aws-credentials');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(secretsService.delete).toHaveBeenCalledWith(
        'default',
        'aws-credentials',
      );
      expect(toast.success).toHaveBeenCalledWith('Secret deleted successfully');
      expect(onSuccess).toHaveBeenCalled();
    });

    it('should work without an onSuccess callback', async () => {
      vi.mocked(secretsService.delete).mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteSecret(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('aws-credentials');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(toast.success).toHaveBeenCalled();
    });

    it('should report the error message on failure', async () => {
      vi.mocked(secretsService.delete).mockRejectedValue(
        new Error('Delete failed'),
      );

      const { result } = renderHook(() => useDeleteSecret(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('aws-credentials');

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith('Failed to delete Secret', {
        description: 'Delete failed',
      });
    });

    it('should fall back to a generic message for non-Error rejections', async () => {
      vi.mocked(secretsService.delete).mockRejectedValue('string error' as never);

      const { result } = renderHook(() => useDeleteSecret(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('aws-credentials');

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith('Failed to delete Secret', {
        description: 'An unexpected error occurred',
      });
    });

    it('should invalidate the list once settled', async () => {
      vi.mocked(secretsService.delete).mockResolvedValue(undefined);

      const queryClient = createQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteSecret(), {
        wrapper: wrapperFor(queryClient),
      });

      result.current.mutate('aws-credentials');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [GET_ALL_SECRETS_QUERY_KEY],
      });
    });

    it('should drop the cached secret', async () => {
      vi.mocked(secretsService.delete).mockResolvedValue(undefined);

      const queryClient = createQueryClient();
      queryClient.setQueryData(
        [GET_SECRET_QUERY_KEY, 'aws-credentials'],
        secretDetail,
      );

      const { result } = renderHook(() => useDeleteSecret(), {
        wrapper: wrapperFor(queryClient),
      });

      result.current.mutate('aws-credentials');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(
        queryClient.getQueryData([GET_SECRET_QUERY_KEY, 'aws-credentials']),
      ).toBeUndefined();
    });

    it('should leave other cached secrets alone', async () => {
      vi.mocked(secretsService.delete).mockResolvedValue(undefined);

      const queryClient = createQueryClient();
      queryClient.setQueryData([GET_SECRET_QUERY_KEY, 'other'], secretDetail);

      const { result } = renderHook(() => useDeleteSecret(), {
        wrapper: wrapperFor(queryClient),
      });

      result.current.mutate('aws-credentials');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(
        queryClient.getQueryData([GET_SECRET_QUERY_KEY, 'other']),
      ).toEqual(secretDetail);
    });
  });
});
