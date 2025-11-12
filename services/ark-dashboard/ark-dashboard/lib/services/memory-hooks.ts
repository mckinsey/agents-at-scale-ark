import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import type { MemoryMessagesFilters } from './memory';
import { memoryService } from './memory';

export const GET_MEMORY_RESOURCES_QUERY_KEY = 'get-memory-resources';
export const GET_SESSIONS_QUERY_KEY = 'get-sessions';
export const GET_ALL_MEMORY_MESSAGES_QUERY_KEY = 'get-all-memory-messages';

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

export const useGetMemoryResources = () => {
  const query = useQuery({
    queryKey: [GET_MEMORY_RESOURCES_QUERY_KEY],
    queryFn: memoryService.getMemoryResources,
  });

  useEffect(() => {
    if (query.error) {
      toast.error('Failed to get Memory Resources', {
        description:
          query.error instanceof Error
            ? query.error.message
            : 'An unexpected error occurred',
      });
    }
  }, [query.error]);

  return query;
};

export const useGetSessions = () => {
  const query = useQuery({
    queryKey: [GET_SESSIONS_QUERY_KEY],
    queryFn: memoryService.getSessions,
  });

  useEffect(() => {
    if (query.error) {
      toast.error('Failed to get Sessions', {
        description:
          query.error instanceof Error
            ? query.error.message
            : 'An unexpected error occurred',
      });
    }
  }, [query.error]);

  return query;
};

export const useGetAllMemoryMessages = (filters: MemoryMessagesFilters) => {
  const query = useQuery({
    queryKey: [
      GET_ALL_MEMORY_MESSAGES_QUERY_KEY,
      filters.memory,
      filters.session,
      filters.query,
    ],
    queryFn: () => memoryService.getAllMemoryMessages(filters),
  });

  useEffect(() => {
    if (query.error) {
      toast.error('Failed to get Memory Messages', {
        description:
          query.error instanceof Error
            ? query.error.message
            : 'An unexpected error occurred',
      });
    }
  }, [query.error]);

  return query;
};

export const useDeleteQueryMemory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: memoryService.deleteQuery,
    onSuccess: (_, { queryId }) => {
      queryClient.invalidateQueries({
        queryKey: [GET_MEMORY_RESOURCES_QUERY_KEY],
      });
      queryClient.invalidateQueries({ queryKey: [GET_SESSIONS_QUERY_KEY] });
      queryClient.invalidateQueries({
        queryKey: [GET_ALL_MEMORY_MESSAGES_QUERY_KEY],
      });
      toast.success(`Successfully deleted Query: ${queryId} from Memory`);
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
      queryClient.invalidateQueries({ queryKey: [GET_SESSIONS_QUERY_KEY] });
      queryClient.invalidateQueries({
        queryKey: [GET_ALL_MEMORY_MESSAGES_QUERY_KEY],
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
      queryClient.invalidateQueries({ queryKey: [GET_SESSIONS_QUERY_KEY] });
      queryClient.invalidateQueries({
        queryKey: [GET_ALL_MEMORY_MESSAGES_QUERY_KEY],
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
