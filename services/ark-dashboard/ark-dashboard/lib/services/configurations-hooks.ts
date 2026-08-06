import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toast } from '@/components/ui/sonner';
import { APIError } from '@/lib/api/client';

import { configurationsService } from './configurations';
import type {
  ConfigurationCreateRequest,
  ConfigurationDetailResponse,
  ConfigurationUpdateRequest,
} from './configurations';

export const GET_ALL_CONFIGURATIONS_QUERY_KEY = 'get-all-configurations';
export const GET_CONFIGURATION_QUERY_KEY = 'get-configuration';
export const CREATE_CONFIGURATION_MUTATION_KEY = 'create-configuration';
export const UPDATE_CONFIGURATION_MUTATION_KEY = 'update-configuration';
export const DELETE_CONFIGURATION_MUTATION_KEY = 'delete-configuration';

export const useGetAllConfigurations = () => {
  return useQuery({
    queryKey: [GET_ALL_CONFIGURATIONS_QUERY_KEY],
    queryFn: configurationsService.getAll,
  });
};

export const useGetConfiguration = (name: string | undefined) => {
  return useQuery({
    queryKey: [GET_CONFIGURATION_QUERY_KEY, name],
    queryFn: () => configurationsService.get(name ?? ''),
    enabled: Boolean(name),
  });
};

type UseCreateConfigurationProps = {
  onSuccess?: (data: ConfigurationDetailResponse) => void;
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

export const useCreateConfiguration = (
  props?: UseCreateConfigurationProps,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [CREATE_CONFIGURATION_MUTATION_KEY],
    mutationFn: (request: ConfigurationCreateRequest) =>
      configurationsService.create(request),
    onMutate: async request => {
      await queryClient.cancelQueries({
        queryKey: [GET_ALL_CONFIGURATIONS_QUERY_KEY],
      });
      const previousConfigurations: ConfigurationDetailResponse[] | undefined =
        queryClient.getQueryData([GET_ALL_CONFIGURATIONS_QUERY_KEY]);
      queryClient.setQueryData(
        [GET_ALL_CONFIGURATIONS_QUERY_KEY],
        (
          old: ConfigurationDetailResponse[] | undefined,
        ): ConfigurationDetailResponse[] => [
          ...(old ?? []),
          {
            id: request.name,
            name: request.name,
            description: request.description,
            alias: request.alias,
            labels: request.labels,
            value: request.value,
          },
        ],
      );
      return { previousConfigurations };
    },
    onSuccess: data => {
      toast.success('Configuration created successfully');
      props?.onSuccess?.(data);
    },
    onError: (error, request, onMutateResult) => {
      queryClient.setQueryData(
        [GET_ALL_CONFIGURATIONS_QUERY_KEY],
        onMutateResult?.previousConfigurations,
      );

      const getMessage = () => {
        if (error instanceof APIError && error.status === 409) {
          return `A Configuration with the name "${request.name}" already exists.`;
        }
        return errorMessage(error);
      };

      toast.error(`Failed to create Configuration: ${request.name}`, {
        description: getMessage(),
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
  onSuccess?: (data: ConfigurationDetailResponse) => void;
};

export const useUpdateConfiguration = (
  props?: UseUpdateConfigurationProps,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [UPDATE_CONFIGURATION_MUTATION_KEY],
    mutationFn: ({
      name,
      request,
    }: {
      name: string;
      request: ConfigurationUpdateRequest;
    }) => configurationsService.update(name, request),
    onSuccess: data => {
      toast.success('Configuration updated successfully');
      props?.onSuccess?.(data);
    },
    onError: (error, { name }) => {
      const getMessage = () => {
        if (error instanceof APIError && error.status === 404) {
          return `Configuration "${name}" not found.`;
        }
        return errorMessage(error);
      };

      toast.error(`Failed to update Configuration: ${name}`, {
        description: getMessage(),
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

  return useMutation({
    mutationKey: [DELETE_CONFIGURATION_MUTATION_KEY],
    mutationFn: (name: string) => configurationsService.delete(name),
    onSuccess: () => {
      toast.success('Configuration deleted successfully');
      props?.onSuccess?.();
    },
    onError: error => {
      toast.error('Failed to delete Configuration', {
        description: errorMessage(error),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [GET_ALL_CONFIGURATIONS_QUERY_KEY],
      });
    },
  });
};
