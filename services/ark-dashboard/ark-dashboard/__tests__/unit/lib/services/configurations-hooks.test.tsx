import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toast } from '@/components/ui/sonner';
import { APIError } from '@/lib/api/client';
import { configurationsService } from '@/lib/services/configurations';
import type {
  Configuration,
  ConfigurationCreateRequest,
  ConfigurationReference,
  ConfigurationUpdateRequest,
} from '@/lib/services/configurations';
import {
  GET_ALL_CONFIGURATIONS_QUERY_KEY,
  GET_CONFIGURATION_QUERY_KEY,
  GET_CONFIGURATION_REFERENCES_QUERY_KEY,
  useCreateConfiguration,
  useDeleteConfiguration,
  useGetAllConfigurations,
  useGetConfiguration,
  useGetConfigurationReferences,
  useUpdateConfiguration,
} from '@/lib/services/configurations-hooks';

vi.mock('@/lib/services/configurations', () => ({
  configurationsService: {
    getAll: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getReferences: vi.fn(),
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

const configuration: Configuration = {
  id: 'db-host',
  name: 'db-host',
  value: 'postgres.internal',
  description: null,
  alias: null,
  labels: [],
};

const createRequest: ConfigurationCreateRequest = {
  name: 'db-host',
  value: 'postgres.internal',
  labels: [],
};

const updateRequest: ConfigurationUpdateRequest = {
  value: 'postgres.other',
  labels: [],
};

describe('configurations-hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useGetAllConfigurations', () => {
    it('should fetch all configurations', async () => {
      vi.mocked(configurationsService.getAll).mockResolvedValue([
        configuration,
      ]);

      const { result } = renderHook(() => useGetAllConfigurations(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual([configuration]);
      expect(configurationsService.getAll).toHaveBeenCalledTimes(1);
    });

    it('should surface fetch errors', async () => {
      const error = new Error('Failed to fetch');
      vi.mocked(configurationsService.getAll).mockRejectedValue(error);

      const { result } = renderHook(() => useGetAllConfigurations(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(error);
    });
  });

  describe('useGetConfiguration', () => {
    it('should fetch the configuration when a name is provided', async () => {
      vi.mocked(configurationsService.get).mockResolvedValue(configuration);

      const { result } = renderHook(() => useGetConfiguration('db-host'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(configurationsService.get).toHaveBeenCalledWith('db-host');
      expect(result.current.data).toEqual(configuration);
    });

    it('should not fetch when the name is undefined', () => {
      const { result } = renderHook(() => useGetConfiguration(undefined), {
        wrapper: createWrapper(),
      });

      expect(result.current.fetchStatus).toBe('idle');
      expect(configurationsService.get).not.toHaveBeenCalled();
    });
  });

  describe('useGetConfigurationReferences', () => {
    it('should fetch references when a name is provided', async () => {
      const references: ConfigurationReference[] = [
        { kind: 'Agent', name: 'triage', field: 'spec.foo' },
      ];
      vi.mocked(configurationsService.getReferences).mockResolvedValue(
        references,
      );

      const { result } = renderHook(
        () => useGetConfigurationReferences('db-host'),
        { wrapper: createWrapper() },
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(configurationsService.getReferences).toHaveBeenCalledWith(
        'db-host',
      );
      expect(result.current.data).toEqual(references);
    });

    it('should not fetch when the name is undefined', () => {
      const { result } = renderHook(
        () => useGetConfigurationReferences(undefined),
        { wrapper: createWrapper() },
      );

      expect(result.current.fetchStatus).toBe('idle');
      expect(configurationsService.getReferences).not.toHaveBeenCalled();
    });
  });

  describe('useCreateConfiguration', () => {
    it('should create a configuration and notify the caller', async () => {
      vi.mocked(configurationsService.create).mockResolvedValue(configuration);

      const onSuccess = vi.fn();
      const { result } = renderHook(
        () => useCreateConfiguration({ onSuccess }),
        { wrapper: createWrapper() },
      );

      result.current.mutate(createRequest);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(toast.success).toHaveBeenCalledWith(
        'Configuration created successfully',
      );
      expect(onSuccess).toHaveBeenCalledWith(configuration);
    });

    it('should report a name clash on 409', async () => {
      vi.mocked(configurationsService.create).mockRejectedValue(
        new APIError('Conflict', 409),
      );

      const { result } = renderHook(() => useCreateConfiguration(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(createRequest);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to create Configuration: db-host',
        {
          description:
            'A Configuration with the name "db-host" already exists.',
        },
      );
    });

    it('should fall back to the error message on other failures', async () => {
      vi.mocked(configurationsService.create).mockRejectedValue(
        new Error('Network error'),
      );

      const { result } = renderHook(() => useCreateConfiguration(), {
        wrapper: createWrapper(),
      });

      result.current.mutate(createRequest);

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to create Configuration: db-host',
        { description: 'Network error' },
      );
    });

    it('should invalidate the list once settled', async () => {
      vi.mocked(configurationsService.create).mockResolvedValue(configuration);

      const queryClient = createQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateConfiguration(), {
        wrapper: wrapperFor(queryClient),
      });

      result.current.mutate(createRequest);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [GET_ALL_CONFIGURATIONS_QUERY_KEY],
      });
    });
  });

  describe('useUpdateConfiguration', () => {
    it('should update a configuration and notify the caller', async () => {
      vi.mocked(configurationsService.update).mockResolvedValue(configuration);

      const onSuccess = vi.fn();
      const { result } = renderHook(
        () => useUpdateConfiguration({ onSuccess }),
        { wrapper: createWrapper() },
      );

      result.current.mutate({ name: 'db-host', request: updateRequest });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(configurationsService.update).toHaveBeenCalledWith(
        'db-host',
        updateRequest,
      );
      expect(toast.success).toHaveBeenCalledWith(
        'Configuration updated successfully',
      );
      expect(onSuccess).toHaveBeenCalledWith(configuration);
    });

    it('should report a missing configuration on 404', async () => {
      vi.mocked(configurationsService.update).mockRejectedValue(
        new APIError('Not Found', 404),
      );

      const { result } = renderHook(() => useUpdateConfiguration(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ name: 'gone', request: updateRequest });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to update Configuration: gone',
        { description: 'Configuration "gone" not found.' },
      );
    });

    it('should fall back to the error message on other failures', async () => {
      vi.mocked(configurationsService.update).mockRejectedValue(
        new Error('Update failed'),
      );

      const { result } = renderHook(() => useUpdateConfiguration(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ name: 'db-host', request: updateRequest });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to update Configuration: db-host',
        { description: 'Update failed' },
      );
    });

    it('should invalidate both the list and the updated configuration', async () => {
      vi.mocked(configurationsService.update).mockResolvedValue(configuration);

      const queryClient = createQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateConfiguration(), {
        wrapper: wrapperFor(queryClient),
      });

      result.current.mutate({ name: 'db-host', request: updateRequest });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [GET_ALL_CONFIGURATIONS_QUERY_KEY],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [GET_CONFIGURATION_QUERY_KEY, 'db-host'],
      });
    });
  });

  describe('useDeleteConfiguration', () => {
    it('should delete a configuration and notify the caller', async () => {
      vi.mocked(configurationsService.delete).mockResolvedValue(undefined);

      const onSuccess = vi.fn();
      const { result } = renderHook(
        () => useDeleteConfiguration({ onSuccess }),
        { wrapper: createWrapper() },
      );

      result.current.mutate('db-host');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(configurationsService.delete).toHaveBeenCalledWith('db-host');
      expect(toast.success).toHaveBeenCalledWith(
        'Configuration deleted successfully',
      );
      expect(onSuccess).toHaveBeenCalled();
    });

    it('should work without an onSuccess callback', async () => {
      vi.mocked(configurationsService.delete).mockResolvedValue(undefined);

      const { result } = renderHook(() => useDeleteConfiguration(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('db-host');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(toast.success).toHaveBeenCalled();
    });

    it('should report the error message on failure', async () => {
      vi.mocked(configurationsService.delete).mockRejectedValue(
        new Error('Delete failed'),
      );

      const { result } = renderHook(() => useDeleteConfiguration(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('db-host');

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to delete Configuration',
        {
          description: 'Delete failed',
        },
      );
    });

    it('should fall back to a generic message for non-Error rejections', async () => {
      vi.mocked(configurationsService.delete).mockRejectedValue(
        'string error' as never,
      );

      const { result } = renderHook(() => useDeleteConfiguration(), {
        wrapper: createWrapper(),
      });

      result.current.mutate('db-host');

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(toast.error).toHaveBeenCalledWith(
        'Failed to delete Configuration',
        {
          description: 'An unexpected error occurred',
        },
      );
    });

    it('should invalidate the list once settled', async () => {
      vi.mocked(configurationsService.delete).mockResolvedValue(undefined);

      const queryClient = createQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteConfiguration(), {
        wrapper: wrapperFor(queryClient),
      });

      result.current.mutate('db-host');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [GET_ALL_CONFIGURATIONS_QUERY_KEY],
      });
    });

    it('should drop the cached configuration and its references', async () => {
      vi.mocked(configurationsService.delete).mockResolvedValue(undefined);

      const queryClient = createQueryClient();
      queryClient.setQueryData(
        [GET_CONFIGURATION_QUERY_KEY, 'db-host'],
        configuration,
      );
      queryClient.setQueryData(
        [GET_CONFIGURATION_REFERENCES_QUERY_KEY, 'db-host'],
        [],
      );

      const { result } = renderHook(() => useDeleteConfiguration(), {
        wrapper: wrapperFor(queryClient),
      });

      result.current.mutate('db-host');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(
        queryClient.getQueryData([GET_CONFIGURATION_QUERY_KEY, 'db-host']),
      ).toBeUndefined();
      expect(
        queryClient.getQueryData([
          GET_CONFIGURATION_REFERENCES_QUERY_KEY,
          'db-host',
        ]),
      ).toBeUndefined();
    });

    it('should leave other cached configurations alone', async () => {
      vi.mocked(configurationsService.delete).mockResolvedValue(undefined);

      const queryClient = createQueryClient();
      queryClient.setQueryData(
        [GET_CONFIGURATION_QUERY_KEY, 'other'],
        configuration,
      );

      const { result } = renderHook(() => useDeleteConfiguration(), {
        wrapper: wrapperFor(queryClient),
      });

      result.current.mutate('db-host');

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(
        queryClient.getQueryData([GET_CONFIGURATION_QUERY_KEY, 'other']),
      ).toEqual(configuration);
    });
  });
});
