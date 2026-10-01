import { useQuery, useQueryClient } from '@tanstack/react-query';

import type { ConversationMessage } from './conversations';
import { conversationsService } from './conversations';

export const useListConversations = (sessionId: string | null) => {
  return useQuery({
    queryKey: ['conversations', sessionId],
    queryFn: () =>
      sessionId ? conversationsService.getConversations(sessionId) : [],
    enabled: !!sessionId,
    refetchInterval: 5000,
    placeholderData: (previousData) => previousData,
    retry: false,
  });
};

/**
 * Poll a conversation's transcript.
 *
 * The first fetch follows the broker's cursor to the end of the conversation;
 * later polls read the cached transcript and ask only for messages after its
 * last sequence, so a steady-state tick stays small. Appending onto the cached
 * array (and returning it unchanged when nothing arrived) keeps the reference
 * stable, which is what lets the memoised transcript skip re-rendering.
 */
export const useGetMessages = (
  sessionId: string | null,
  conversationId: string | null
) => {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['messages', sessionId, conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const cached = queryClient.getQueryData<ConversationMessage[]>([
        'messages',
        sessionId,
        conversationId,
      ]);
      const lastSequence = cached?.at(-1)?.sequence;

      if (!cached || lastSequence === undefined) {
        return (await conversationsService.getMessages(conversationId)).messages;
      }

      const { messages: newMessages, total } =
        await conversationsService.getMessages(conversationId, lastSequence);

      if (total !== undefined && total < cached.length) {
        return (await conversationsService.getMessages(conversationId)).messages;
      }

      return newMessages.length > 0 ? [...cached, ...newMessages] : cached;
    },
    enabled: !!conversationId,
    refetchInterval: 2000,
    retry: false,
    placeholderData: (previousData) => previousData,
  });
};
