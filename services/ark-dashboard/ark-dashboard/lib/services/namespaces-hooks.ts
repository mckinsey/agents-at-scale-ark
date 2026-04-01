import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { namespacesService } from './namespaces';

export const GET_CONTEXT_QUERY_KEY = 'get-context';
export const GET_ALL_NAMESPACES_QUERY_KEY = 'get-all-namespaces';

export const useGetContext = () => {
  return useQuery({
    queryKey: [GET_CONTEXT_QUERY_KEY],
    queryFn: namespacesService.getContext,
  });
};

export const useGetAllNamespaces = () => {
  return useQuery({
    queryKey: [GET_ALL_NAMESPACES_QUERY_KEY],
    queryFn: namespacesService.getAll,
  });
};

type UseCreateNamespaceProps = {
  onSuccess?: (name: string) => void;
};

export const useCreateNamespace = (props?: UseCreateNamespaceProps) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: namespacesService.create,
    onSuccess: (_, name) => {
      toast.success('Namespace Created', {
        description: `Successfully created namespace ${name}`,
      });

      queryClient.invalidateQueries({ queryKey: [GET_CONTEXT_QUERY_KEY] });

      if (props?.onSuccess) {
        props.onSuccess(name);
      }
    },
    onError: (error, name) => {
      toast.error(`Failed to create Namespace: ${name}`, {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    },
  });
};
