import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/sonner';

import { APIError } from '@/lib/api/client';
import { useNamespace } from '@/providers/NamespaceProvider';

import { configurationsService } from './configurations';
import { createResourceErrorMessage } from './resource-error-message';
import type {
  Configuration,
  ConfigurationCreateRequest,
  ConfigurationUpdateRequest,
} from './configurations';

export const GET_ALL_CONFIGURATIONS_QUERY_KEY = 'get-all-configurations';
export const GET_CONFIGURATION_QUERY_KEY = 'get-configuration';
export const GET_CONFIGURATION_REFERENCES_QUERY_KEY =
  'get-configuration-references';
export const CREATE_CONFIGURATION_MUTATION_KEY = 'create-configuration';
export const UPDATE_CONFIGURATION_MUTATION_KEY = 'update-configuration';
export const DELETE_CONFIGURATION_MUTATION_KEY = 'delete-configuration';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

export const useGetAllConfigurations = () => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_ALL_CONFIGURATIONS_QUERY_KEY, namespace],
    queryFn: () => configurationsService.getAll(namespace),
    enabled: Boolean(namespace),
  });
};

export const useGetConfiguration = (name: string | undefined) => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_CONFIGURATION_QUERY_KEY, name, namespace],
    queryFn: () => configurationsService.get(namespace, name ?? ''),
    enabled: Boolean(name) && Boolean(namespace),
  });
};

export const useGetConfigurationReferences = (name: string | undefined) => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_CONFIGURATION_REFERENCES_QUERY_KEY, name, namespace],
    queryFn: () => configurationsService.getReferences(namespace, name ?? ''),
    enabled: Boolean(name) && Boolean(namespace),
  });
};

type UseCreateConfigurationProps = {
  onSuccess?: (data: Configuration) => void;
};

export const useCreateConfiguration = (
  props?: UseCreateConfigurationProps,
) => {
  const queryClient = useQueryClient();
  const { namespace } = useNamespace();

  return useMutation({
    mutationKey: [CREATE_CONFIGURATION_MUTATION_KEY],
    mutationFn: (request: ConfigurationCreateRequest) =>
      configurationsService.create(namespace, request),
    onSuccess: data => {
      toast.success('Configuration created successfully');
      props?.onSuccess?.(data);
    },
    onError: (error, request) => {
      toast.error(`Failed to create Configuration: ${request.name}`, {
        description: createResourceErrorMessage(
          error,
          'Configuration',
          request.name,
        ),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [GET_ALL_CONFIGURATIONS_QUERY_KEY],
      });
    },
  });
};

type UseUpdateConfigurationProps = {
  onSuccess?: (data: Configuration) => void;
};

export const useUpdateConfiguration = (
  props?: UseUpdateConfigurationProps,
) => {
  const queryClient = useQueryClient();
  const { namespace } = useNamespace();

  return useMutation({
    mutationKey: [UPDATE_CONFIGURATION_MUTATION_KEY],
    mutationFn: ({
      name,
      request,
    }: {
      name: string;
      request: ConfigurationUpdateRequest;
    }) => configurationsService.update(namespace, name, request),
    onSuccess: data => {
      toast.success('Configuration updated successfully');
      props?.onSuccess?.(data);
    },
    onError: (error, { name }) => {
      const message =
        error instanceof APIError && error.status === 404
          ? `Configuration "${name}" not found.`
          : getErrorMessage(error);

      toast.error(`Failed to update Configuration: ${name}`, {
        description: message,
      });
    },
    onSettled: (_data, _error, { name }) => {
      queryClient.invalidateQueries({
        queryKey: [GET_ALL_CONFIGURATIONS_QUERY_KEY],
      });
      queryClient.invalidateQueries({
        queryKey: [GET_CONFIGURATION_QUERY_KEY, name],
      });
    },
  });
};

type UseDeleteConfigurationProps = {
  onSuccess?: () => void;
};

export const useDeleteConfiguration = (
  props?: UseDeleteConfigurationProps,
) => {
  const queryClient = useQueryClient();
  const { namespace } = useNamespace();

  return useMutation({
    mutationKey: [DELETE_CONFIGURATION_MUTATION_KEY],
    mutationFn: (name: string) => configurationsService.delete(namespace, name),
    onSuccess: (_data, name) => {
      queryClient.removeQueries({
        queryKey: [GET_CONFIGURATION_QUERY_KEY, name],
      });
      queryClient.removeQueries({
        queryKey: [GET_CONFIGURATION_REFERENCES_QUERY_KEY, name],
      });
      toast.success('Configuration deleted successfully');
      props?.onSuccess?.();
    },
    onError: error => {
      toast.error('Failed to delete Configuration', {
        description: getErrorMessage(error),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [GET_ALL_CONFIGURATIONS_QUERY_KEY],
      });
    },
  });
};
