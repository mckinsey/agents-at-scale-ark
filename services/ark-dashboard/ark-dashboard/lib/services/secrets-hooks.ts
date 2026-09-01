import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/sonner';

import { APIError } from '@/lib/api/client';
import { useNamespace } from '@/providers/NamespaceProvider';

import { secretsService } from './secrets';
import type { Secret, SecretDetailResponse } from './secrets';

export const GET_ALL_SECRETS_QUERY_KEY = 'get-all-secrets';
export const GET_SECRET_QUERY_KEY = 'get-secret';
export const CREATE_SECRET_MUTATION_KEY = 'create-secret';
export const UPDATE_SECRET_MUTATION_KEY = 'update-secret';
export const DELETE_SECRET_MUTATION_KEY = 'delete-secret';

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
    enabled: Boolean(name && namespace),
  });
};

type UseCreateSecretProps = {
  onSuccess?: (data: SecretDetailResponse) => void;
};

export const useCreateSecret = (props: UseCreateSecretProps) => {
  const queryClient = useQueryClient();
  const { namespace } = useNamespace();

  return useMutation({
    mutationKey: [CREATE_SECRET_MUTATION_KEY],
    mutationFn: ({ name, password }: { name: string; password: string }) => {
      return secretsService.create(namespace, name, password);
    },
    onMutate: async newSecret => {
      // Cancel any outgoing refetches
      // (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({
        queryKey: [GET_ALL_SECRETS_QUERY_KEY, namespace],
      });
      // Snapshot the previous value
      const previousTodos: Secret[] | undefined = queryClient.getQueryData([
        GET_ALL_SECRETS_QUERY_KEY,
        namespace,
      ]);
      // Optimistically update to the new value
      queryClient.setQueryData(
        [GET_ALL_SECRETS_QUERY_KEY, namespace],
        (old: Secret[] | undefined): Secret[] => [
          ...(old ?? []),
          { id: newSecret.name, name: newSecret.name },
        ],
      );
      // Return a result with the snapshotted value
      return { previousTodos };
    },
    onSuccess: data => {
      toast.success('Secret created successfully');

      if (props.onSuccess) {
        props.onSuccess(data);
      }
    },
    onError: (error, data, onMutateResult) => {
      // If the mutation fails,
      // use the result returned from onMutate to roll back
      queryClient.setQueryData(
        [GET_ALL_SECRETS_QUERY_KEY, namespace],
        onMutateResult?.previousTodos,
      );

      const getMessage = () => {
        if (error instanceof APIError && error.status === 409) {
          return `A Secret with the name "${data.name}" already exists.`;
        }
        if (error instanceof Error) {
          return error.message;
        }
        return 'An unexpected error occurred';
      };

      toast.error(`Failed to create Secret: ${data.name}`, {
        description: getMessage(),
      });
    },
    // Always refetch after error or success:
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [GET_ALL_SECRETS_QUERY_KEY] });
    },
  });
};

type UseUpdateSecretProps = {
  onSuccess?: (data: SecretDetailResponse) => void;
};

export const useUpdateSecret = (props: UseUpdateSecretProps) => {
  const queryClient = useQueryClient();
  const { namespace } = useNamespace();

  return useMutation({
    mutationKey: [UPDATE_SECRET_MUTATION_KEY],
    mutationFn: ({ name, password }: { name: string; password: string }) => {
      return secretsService.update(namespace, name, password);
    },
    onSuccess: data => {
      toast.success('Secret updated successfully');

      if (props.onSuccess) {
        props.onSuccess(data);
      }
    },
    onError: (error, data) => {
      const getMessage = () => {
        if (error instanceof APIError && error.status === 404) {
          return `Secret "${data.name}" not found.`;
        }
        if (error instanceof Error) {
          return error.message;
        }
        return 'An unexpected error occurred';
      };

      toast.error(`Failed to update Secret: ${data.name}`, {
        description: getMessage(),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [GET_ALL_SECRETS_QUERY_KEY] });
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
    mutationFn: (name: string) => {
      return secretsService.delete(namespace, name);
    },
    onSuccess: () => {
      toast.success('Secret deleted successfully');

      if (props?.onSuccess) {
        props.onSuccess();
      }
    },
    onError: error => {
      const getMessage = () => {
        if (error instanceof Error) {
          return error.message;
        }
        return 'An unexpected error occurred';
      };

      toast.error('Failed to delete Secret', {
        description: getMessage(),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [GET_ALL_SECRETS_QUERY_KEY] });
    },
  });
};
