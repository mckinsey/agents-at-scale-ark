import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { memoryService } from './memory';

export const GET_MEMORY_RESOURCES_QUERY_KEY = 'get-memory-resources';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

export const useGetMemoryResources = () => {
  return useQuery({
    queryKey: [GET_MEMORY_RESOURCES_QUERY_KEY],
    queryFn: memoryService.getMemoryResources,
  });
};

export const useDeleteQueryMemory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: memoryService.deleteQuery,
    onSuccess: (_, { queryId }) => {
      queryClient.invalidateQueries({
        queryKey: [GET_MEMORY_RESOURCES_QUERY_KEY],
      });
      toast.success(
        `Successfully deleted Memory entries for Query: ${queryId}`,
      );
    },
    onError: (error, { queryId }) => {
      console.error(`Failed to delete Query: ${queryId} from Memory:`, error);
      toast.error(`Failed to delete Query: ${queryId} from Memory`, {
        description: getErrorMessage(error),
      });
    },
  });
};

export const useDeleteSessionMemory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: memoryService.deleteSession,
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({
        queryKey: [GET_MEMORY_RESOURCES_QUERY_KEY],
      });
      toast.success(`Successfully deleted Session: ${sessionId} from Memory`);
    },
    onError: (error, sessionId) => {
      console.error(
        `Failed to delete Session: ${sessionId} from Memory:`,
        error,
      );
      toast.error(`Failed to delete Session: ${sessionId} from Memory`, {
        description: getErrorMessage(error),
      });
    },
  });
};

export const useResetMemory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: memoryService.resetMemory,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [GET_MEMORY_RESOURCES_QUERY_KEY],
      });
      toast.success('Successfully reseted Memory');
    },
    onError: error => {
      console.error('Failed to reset Memory:', error);
      toast.error('Failed to reset Memory', {
        description: getErrorMessage(error),
      });
    },
  });
};
