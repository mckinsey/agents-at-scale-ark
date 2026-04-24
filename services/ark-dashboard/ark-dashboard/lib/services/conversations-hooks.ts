import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsService } from './conversations';

export const useListConversations = (sessionId: string | null) => {
  return useQuery({
    queryKey: ['conversations', sessionId],
    queryFn: () =>
      sessionId ? conversationsService.getConversations(sessionId) : [],
    enabled: !!sessionId,
    placeholderData: (previousData) => previousData,
  });
};

export const useGetMessages = (sessionId: string | null, conversationId: string | null) => {
  return useQuery({
    queryKey: ['messages', sessionId, conversationId],
    queryFn: () =>
      sessionId && conversationId ? conversationsService.getMessages(sessionId, conversationId) : [],
    enabled: !!sessionId && !!conversationId,
    refetchInterval: 2000,
  });
};

export const useSendMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: conversationsService.sendMessage,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['messages', variables.conversationId]
      });
      queryClient.invalidateQueries({
        queryKey: ['conversations', variables.sessionId]
      });
    },
  });
};
