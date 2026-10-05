import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/sonner';

import { APIError } from '@/lib/api/client';
import { useNamespace } from '@/providers/NamespaceProvider';

import { createResourceErrorMessage } from './resource-error-message';
import { secretsService } from './secrets';
import type {
  SecretCreateRequest,
  SecretDetailResponse,
  SecretUpdateRequest,
} from './secrets';

export const GET_ALL_SECRETS_QUERY_KEY = 'get-all-secrets';
export const GET_SECRET_QUERY_KEY = 'get-secret';
export const CREATE_SECRET_MUTATION_KEY = 'create-secret';
export const UPDATE_SECRET_MUTATION_KEY = 'update-secret';
export const DELETE_SECRET_MUTATION_KEY = 'delete-secret';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

export const useGetAllSecrets = () => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_ALL_SECRETS_QUERY_KEY, namespace],
    queryFn: () => secretsService.getAll(namespace),
    enabled: Boolean(namespace),
  });
};

export const useGetSecret = (name: string | undefined) => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_SECRET_QUERY_KEY, name, namespace],
    queryFn: () => secretsService.get(namespace, name ?? ''),
    enabled: Boolean(name) && Boolean(namespace),
  });
};

type UseCreateSecretProps = {
  onSuccess?: (data: SecretDetailResponse) => void;
};

export const useCreateSecret = (props?: UseCreateSecretProps) => {
  const queryClient = useQueryClient();
  const { namespace } = useNamespace();

  return useMutation({
    mutationKey: [CREATE_SECRET_MUTATION_KEY],
    mutationFn: (request: SecretCreateRequest) =>
      secretsService.create(namespace, request),
    onSuccess: data => {
      toast.success('Secret created successfully');
      props?.onSuccess?.(data);
    },
    onError: (error, request) => {
      toast.error(`Failed to create Secret: ${request.name}`, {
        description: createResourceErrorMessage(error, 'Secret', request.name),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [GET_ALL_SECRETS_QUERY_KEY] });
    },
  });
};

type UseUpdateSecretProps = {
  onSuccess?: (data: SecretDetailResponse) => void;
};

export const useUpdateSecret = (props?: UseUpdateSecretProps) => {
  const queryClient = useQueryClient();
  const { namespace } = useNamespace();

  return useMutation({
    mutationKey: [UPDATE_SECRET_MUTATION_KEY],
    mutationFn: ({
      name,
      request,
    }: {
      name: string;
      request: SecretUpdateRequest;
    }) => secretsService.update(namespace, name, request),
    onSuccess: data => {
      toast.success('Secret updated successfully');
      props?.onSuccess?.(data);
    },
    onError: (error, { name }) => {
      const message =
        error instanceof APIError && error.status === 404
          ? `Secret "${name}" not found.`
          : getErrorMessage(error);

      toast.error(`Failed to update Secret: ${name}`, {
        description: message,
      });
    },
    onSettled: (_data, _error, { name }) => {
      queryClient.invalidateQueries({ queryKey: [GET_ALL_SECRETS_QUERY_KEY] });
      queryClient.invalidateQueries({
        queryKey: [GET_SECRET_QUERY_KEY, name],
      });
    },
  });
};

type UseDeleteSecretProps = {
  onSuccess?: () => void;
};

export const useDeleteSecret = (props?: UseDeleteSecretProps) => {
  const queryClient = useQueryClient();
  const { namespace } = useNamespace();

  return useMutation({
    mutationKey: [DELETE_SECRET_MUTATION_KEY],
    mutationFn: (name: string) => secretsService.delete(namespace, name),
    onSuccess: (_data, name) => {
      queryClient.removeQueries({
        queryKey: [GET_SECRET_QUERY_KEY, name],
      });
      toast.success('Secret deleted successfully');
      props?.onSuccess?.();
    },
    onError: error => {
      toast.error('Failed to delete Secret', {
        description: getErrorMessage(error),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [GET_ALL_SECRETS_QUERY_KEY] });
    },
  });
};
