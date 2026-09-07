import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { useNamespace } from '@/providers/NamespaceProvider';

import type { QueryParameter } from './chat';
import type { ParticipantType } from './conversations';
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
  const { namespace } = useNamespace();

  return useMutation({
    mutationFn: (params: {
      conversationId: string;
      message: string;
      sessionId: string;
      agentName: string;
      participantType?: ParticipantType;
      parameters?: QueryParameter[];
    }) => conversationsService.sendMessage({ ...params, namespace }),
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
