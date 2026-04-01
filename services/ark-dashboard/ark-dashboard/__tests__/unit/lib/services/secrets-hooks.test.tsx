import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { APIError } from '@/lib/api/client';
import { secretsService } from '@/lib/services/secrets';
import {
  GET_ALL_SECRETS_QUERY_KEY,
  useCreateSecret,
  useDeleteSecret,
  useGetAllSecrets,
  useUpdateSecret,
} from '@/lib/services/secrets-hooks';
import { toast } from 'sonner';

vi.mock('@/lib/services/secrets', () => ({
  secretsService: {
    getAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('secrets-hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useGetAllSecrets', () => {
    it('should fetch all secrets', async () => {
      const mockSecrets = [
        { id: 'secret-1', name: 'secret-1' },
        { id: 'secret-2', name: 'secret-2' },
      ];
      vi.mocked(secretsService.getAll).mockResolvedValue(mockSecrets as any);

      const { result } = renderHook(() => useGetAllSecrets(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockSecrets);
      expect(secretsService.getAll).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when fetching secrets', async () => {
      const error = new Error('Failed to fetch');
      vi.mocked(secretsService.getAll).mockRejectedValue(error);

      const { result } = renderHook(() => useGetAllSecrets(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(error);
    });
  });

  describe('useCreateSecret', () => {
    it('should create a secret successfully', async () => {
      const mockResponse = { name: 'test-secret' };
      vi.mocked(secretsService.create).mockResolvedValue(mockResponse as any);

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      queryClient.setQueryData([GET_ALL_SECRETS_QUERY_KEY], []);

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useCreateSecret({ onSuccess }), {
        wrapper,
      });

      result.current.mutate({ name: 'test-secret', password: 'password123' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(secretsService.create).toHaveBeenCalledWith(
        'test-secret',
        'password123',
      );
      expect(toast.success).toHaveBeenCalledWith('Secret Created', {
        description: 'Successfully created secret test-secret',
      });
      expect(onSuccess).toHaveBeenCalledWith(mockResponse);
    });

    it('should handle 409 conflict error when creating', async () => {
      const error = new APIError('Conflict', 409);
      vi.mocked(secretsService.create).mockRejectedValue(error);

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      queryClient.setQueryData([GET_ALL_SECRETS_QUERY_KEY], []);

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );

      const { result } = renderHook(() => useCreateSecret({}), {
        wrapper,
      });

      result.current.mutate({ name: 'duplicate-secret', password: 'pass' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to create Secret: duplicate-secret',
        {
          description: 'A Secret with the name "duplicate-secret" already exists.',
        },
      );
    });

    it('should handle generic errors when creating', async () => {
      const error = new Error('Network error');
      vi.mocked(secretsService.create).mockRejectedValue(error);

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      queryClient.setQueryData([GET_ALL_SECRETS_QUERY_KEY], []);

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );

      const { result } = renderHook(() => useCreateSecret({}), {
        wrapper,
      });

      result.current.mutate({ name: 'test-secret', password: 'pass' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to create Secret: test-secret',
        {
          description: 'Network error',
        },
      );
    });
  });

  describe('useUpdateSecret', () => {
    it('should update a secret successfully', async () => {
      const mockResponse = { name: 'updated-secret' };
      vi.mocked(secretsService.update).mockResolvedValue(mockResponse as any);

      const onSuccess = vi.fn();
      const { result } = renderHook(() => useUpdateSecret({ onSuccess }), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        name: 'updated-secret',
        password: 'newpassword123',
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(secretsService.update).toHaveBeenCalledWith(
        'updated-secret',
        'newpassword123',
      );
      expect(toast.success).toHaveBeenCalledWith('Secret Updated', {
        description: 'Successfully updated secret updated-secret',
      });
      expect(onSuccess).toHaveBeenCalledWith(mockResponse);
    });

    it('should handle 404 error when updating non-existent secret', async () => {
      const error = new APIError('Not Found', 404);
      vi.mocked(secretsService.update).mockRejectedValue(error);

      const { result } = renderHook(() => useUpdateSecret({}), {
        wrapper: createWrapper(),
      });

      result.current.mutate({
        name: 'nonexistent-secret',
        password: 'pass',
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to update Secret: nonexistent-secret',
        {
          description: 'Secret "nonexistent-secret" not found.',
        },
      );
    });

    it('should handle generic errors when updating', async () => {
      const error = new Error('Update failed');
      vi.mocked(secretsService.update).mockRejectedValue(error);

      const { result } = renderHook(() => useUpdateSecret({}), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ name: 'test-secret', password: 'pass' });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to update Secret: test-secret',
        {
          description: 'Update failed',
        },
      );
    });

    it('should invalidate queries on success', async () => {
      const mockResponse = { name: 'test-secret' };
      vi.mocked(secretsService.update).mockResolvedValue(mockResponse as any);

      const queryClient = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
      });
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );

      const { result } = renderHook(() => useUpdateSecret({}), { wrapper });

      result.current.mutate({ name: 'test-secret', password: 'pass' });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [GET_ALL_SECRETS_QUERY_KEY],
      });
    });
  });

  describe('useDeleteSecret', () => {
    it('should delete a secret successfully', async () => {
      vi.mocked(secretsService.delete).mockResolvedValue(undefined as any);

      const onSuccess = vi.fn();
      const { result } = renderHook(
        () => useDeleteSecret({ onSuccess }),
        {
          wrapper: createWrapper(),
        },
      );

      result.current.mutate('delete-me');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(secretsService.delete).toHaveBeenCalledWith('delete-me');
      expect(toast.success).toHaveBeenCalledWith('Secret Deleted', {
        description: 'Successfully deleted the secret',
      });
      expect(onSuccess).toHaveBeenCalled();
    });

    it('should work without onSuccess callback', async () => {
      vi.mocked(secretsService.delete).mockResolvedValue(undefined as any);

      const { result } = renderHook(() => useDeleteSecret(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('delete-me');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(secretsService.delete).toHaveBeenCalledWith('delete-me');
      expect(toast.success).toHaveBeenCalled();
    });

    it('should handle errors when deleting', async () => {
      const error = new Error('Delete failed');
      vi.mocked(secretsService.delete).mockRejectedValue(error);

      const { result } = renderHook(() => useDeleteSecret(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('test-secret');

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith('Failed to delete Secret', {
        description: 'Delete failed',
      });
    });

    it('should handle non-Error objects when deleting', async () => {
      vi.mocked(secretsService.delete).mockRejectedValue('string error' as any);

      const { result } = renderHook(() => useDeleteSecret(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('test-secret');

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith('Failed to delete Secret', {
        description: 'An unexpected error occurred',
      });
    });

    it('should invalidate queries on success', async () => {
      vi.mocked(secretsService.delete).mockResolvedValue(undefined as any);

      const queryClient = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
      });
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );

      const { result } = renderHook(() => useDeleteSecret(), { wrapper });

      result.current.mutate('test-secret');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [GET_ALL_SECRETS_QUERY_KEY],
      });
    });
  });
});
