import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useNamespace } from '@/providers/NamespaceProvider';

import { executionEnginesService } from './engines';

export const GET_ALL_EXECUTION_ENGINES_QUERY_KEY = 'get-all-execution-engines';

export const useGetAllExecutionEngines = () => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_ALL_EXECUTION_ENGINES_QUERY_KEY, namespace],
    queryFn: () => executionEnginesService.getAll(namespace),
    enabled: Boolean(namespace),
  });
};

export const useDeleteExecutionEngine = () => {
  const queryClient = useQueryClient();
  const { namespace } = useNamespace();

  return useMutation({
    mutationFn: (name: string) =>
      executionEnginesService.delete(namespace, name),
    onSuccess: (_result, name) => {
      toast.success('Execution Engine Deleted', {
        description: `Successfully deleted ${name}`,
      });
      queryClient.invalidateQueries({
        queryKey: [GET_ALL_EXECUTION_ENGINES_QUERY_KEY],
      });
    },
    onError: (error, name) => {
      toast.error(`Failed to delete Execution Engine: ${name}`, {
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred',
      });
    },
  });
};
