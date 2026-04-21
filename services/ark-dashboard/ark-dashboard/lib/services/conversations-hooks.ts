import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsService } from './conversations';

export const useListConversations = (sessionId: string | null) => {
  return useQuery({
    queryKey: ['conversations', sessionId],
    queryFn: () =>
      sessionId ? conversationsService.getConversations(sessionId) : [],
    enabled: !!sessionId,
  });
};

export const useGetMessages = (conversationId: string | null) => {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () =>
      conversationId ? conversationsService.getMessages(conversationId) : [],
    enabled: !!conversationId,
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
    },
  });
};
