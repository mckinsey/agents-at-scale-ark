import { apiClient } from '@/lib/api/client';
import type { ChatMessage } from '@/lib/types/chat-message';

export type ParticipantType = 'agent' | 'team' | 'tool';

export interface Conversation {
  conversationId: string;
  name: string;
  participants: string[];
  messageCount: number;
  toolCallCount: number;
  duration: string;
  startTime: string;
  isTemporary?: boolean;
  participantType?: ParticipantType;
  errorCount: number;
}

export interface ConversationMessage {
  timestamp: string;
  conversation_id: string;
  query_id: string;
  message: ChatMessage;
  sequence: number;
}

export const conversationsService = {
  async getConversations(sessionId: string): Promise<Conversation[]> {
    try {
      const session = await apiClient.get<any>(`/api/v1/broker/sessions/${sessionId}`);
      if (!session || !session.conversations) return [];

      const { logsService } = await import('./logs');
      const events = await logsService.getEvents(sessionId, 1000);

      const queries = Object.values(session.queries || {});

      const conversations = session.conversations.map((conv: any): Conversation => {
        const conversationQueries = queries.filter((q: any) => q.conversationId === conv.conversationId);
        const queryNames = new Set(conversationQueries.map((q: any) => q.name));

        const toolCallCount = events
          ? events.items.filter(e =>
              e.reason === 'ToolCallComplete' &&
              queryNames.has(e.data.queryName)
            ).length
          : 0;

        return {
          conversationId: conv.conversationId,
          name: conv.name,
          participants: conv.participants,
          messageCount: conv.messageCount,
          toolCallCount,
          duration: conv.duration,
          startTime: conv.startTime,
          participantType: conv.participantType,
          errorCount: conv.errorCount,
        };
      });

      return conversations;
    } catch (error) {
      console.error(`Failed to fetch conversations for session ${sessionId}:`, error);
      return [];
    }
  },

  /**
   * Get messages for a conversation from the Memory Broker.
   */
  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    try {
      const response = await apiClient.get<{ items: ConversationMessage[] }>(
        `/api/v1/broker/messages?conversation_id=${conversationId}`
      );
      return response.items || [];
    } catch (error) {
      console.error(`Failed to fetch messages for conversation ${conversationId}:`, error);
      return [];
    }
  },


  async sendMessage(params: {
    conversationId: string;
    message: string;
    sessionId: string;
    agentName: string;
    participantType?: ParticipantType;
  }): Promise<void> {
    const { chatService } = await import('./chat');

    const targetName = params.agentName.includes('/')
      ? params.agentName.split('/').pop() || params.agentName
      : params.agentName;

    await chatService.submitChatQuery(
      params.message,
      params.participantType || 'agent',
      targetName,
      params.sessionId,
      params.conversationId
    );
  },

};
