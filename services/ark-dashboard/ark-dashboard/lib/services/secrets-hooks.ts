import type { QueryKey } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { APIError } from '@/lib/api/client';

import { secretsService } from './secrets';
import type { Secret, SecretDetailResponse } from './secrets';

export const GET_ALL_SECRETS_QUERY_KEY = 'get-all-secrets';
export const CREATE_SECRET_MUTATION_KEY = 'create-secret';

export const useGetAllSecrets = (namespace?: string) => {
  return useQuery({
    queryKey: [GET_ALL_SECRETS_QUERY_KEY, namespace],
    queryFn: () => secretsService.getAll(namespace),
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
      await queryClient.cancelQueries({
        queryKey: [GET_ALL_SECRETS_QUERY_KEY],
      });
      const previousSecrets = queryClient.getQueriesData<Secret[]>({
        queryKey: [GET_ALL_SECRETS_QUERY_KEY],
      });
      queryClient.setQueriesData<Secret[]>(
        { queryKey: [GET_ALL_SECRETS_QUERY_KEY] },
        (old): Secret[] => [
          ...(old ?? []),
          { id: newSecret.name, name: newSecret.name },
        ],
      );
      return { previousSecrets };
    },
    onSuccess: data => {
      toast.success('Secret Created', {
        description: `Successfully created secret ${data.name}`,
      });

      if (props.onSuccess) {
        props.onSuccess(data);
      }
    },
    onError: (error, data, context) => {
      context?.previousSecrets?.forEach(
        ([queryKey, data]: [QueryKey, Secret[] | undefined]) => {
          queryClient.setQueryData(queryKey, data);
        },
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [GET_ALL_SECRETS_QUERY_KEY] });
    },
  });
};
