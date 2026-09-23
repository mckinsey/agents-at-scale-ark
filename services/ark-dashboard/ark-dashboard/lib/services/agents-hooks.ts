import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toast } from '@/components/ui/sonner';
import { useNamespace } from '@/providers/NamespaceProvider';

import { agentsService } from './agents';

export const GET_ALL_AGENTS_QUERY_KEY = 'get-all-agents';
export const GET_AGENT_BY_NAME_QUERY_KEY = 'get-agent-by-name';
export const DELETE_AGENT_MUTATION_KEY = 'delete-agent';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

export const useGetAllAgents = () => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_ALL_AGENTS_QUERY_KEY, namespace],
    queryFn: () => agentsService.list(namespace),
    enabled: Boolean(namespace),
  });
};

export const useGetAgent = (name: string | undefined) => {
  const { namespace } = useNamespace();

  return useQuery({
    queryKey: [GET_AGENT_BY_NAME_QUERY_KEY, name, namespace],
    queryFn: () => agentsService.getByName(namespace, name ?? ''),
    enabled: Boolean(name) && Boolean(namespace),
  });
};

type UseDeleteAgentProps = {
  onSuccess?: () => void;
};

export const useDeleteAgent = (props?: UseDeleteAgentProps) => {
  const queryClient = useQueryClient();
  const { namespace } = useNamespace();

  return useMutation({
    mutationKey: [DELETE_AGENT_MUTATION_KEY],
    mutationFn: (id: number | string) =>
      agentsService.deleteById(namespace, id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({
        queryKey: [GET_AGENT_BY_NAME_QUERY_KEY, String(id)],
      });
      toast.success('Agent deleted successfully');
      props?.onSuccess?.();
    },
    onError: error => {
      toast.error('Failed to delete Agent', {
        description: getErrorMessage(error),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [GET_ALL_AGENTS_QUERY_KEY] });
    },
  });
};
