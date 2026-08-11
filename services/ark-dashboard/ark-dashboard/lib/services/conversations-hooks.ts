import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsService } from './conversations';

export const useListConversations = (sessionId: string | null, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['conversations', sessionId],
    queryFn: () =>
      sessionId ? conversationsService.getConversations(sessionId) : [],
    enabled: options?.enabled !== false && !!sessionId,
    refetchInterval: 5000,
    placeholderData: (previousData) => previousData,
    retry: false,
  });
};

export const useGetMessages = (sessionId: string | null, conversationId: string | null, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['messages', sessionId, conversationId],
    queryFn: () =>
      conversationId ? conversationsService.getMessages(conversationId) : [],
    enabled: options?.enabled !== false && !!conversationId,
    refetchInterval: 2000,
    retry: false,
    placeholderData: (previousData) => previousData,
  });
};

export const useSendMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: conversationsService.sendMessage,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['messages', variables.sessionId, variables.conversationId]
      });
      queryClient.invalidateQueries({
        queryKey: ['conversations', variables.sessionId]
      });
    },
  });
};
