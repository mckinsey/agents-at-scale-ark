import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { APIError } from '@/lib/api/client';

import { secretsService } from './secrets';
import type { Secret, SecretDetailResponse } from './secrets';

export const GET_ALL_SECRETS_QUERY_KEY = 'get-all-secrets';
export const CREATE_SECRET_MUTATION_KEY = 'create-secret';

export const useGetAllSecrets = () => {
  return useQuery({
    queryKey: [GET_ALL_SECRETS_QUERY_KEY],
    queryFn: secretsService.getAll,
  });
};

type UseCreateSecretProps = {
  onSuccess?: (data: SecretDetailResponse) => void;
};

export const useCreateSecret = (props: UseCreateSecretProps) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [CREATE_SECRET_MUTATION_KEY],
    mutationFn: ({ name, password }: { name: string; password: string }) => {
      return secretsService.create(name, password);
    },
    onMutate: async newSecret => {
      // Cancel any outgoing refetches
      // (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({
        queryKey: [GET_ALL_SECRETS_QUERY_KEY],
      });
      // Snapshot the previous value
      const previousTodos: Secret[] | undefined = queryClient.getQueryData([
        GET_ALL_SECRETS_QUERY_KEY,
      ]);
      // Optimistically update to the new value
      queryClient.setQueryData(
        [GET_ALL_SECRETS_QUERY_KEY],
        (old: Secret[]): Secret[] => [
          ...old,
          { id: newSecret.name, name: newSecret.name },
        ],
      );
      // Return a result with the snapshotted value
      return { previousTodos };
    },
    onSuccess: data => {
      toast.success('Secret Created', {
        description: `Successfully created secret ${data.name}`,
      });

      if (props.onSuccess) {
        props.onSuccess(data);
      }
    },
    onError: (error, data, onMutateResult) => {
      // If the mutation fails,
      // use the result returned from onMutate to roll back
      queryClient.setQueryData(
        [GET_ALL_SECRETS_QUERY_KEY],
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
