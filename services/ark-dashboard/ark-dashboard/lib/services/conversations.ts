import { apiClient } from '@/lib/api/client';
import type { ChatMessage } from '@/lib/types/chat-message';
import type { BrokerSession, ConversationSummary } from './broker-sessions';
import { logsService } from './logs';
import { chatService } from './chat';
import type { QueryParameter } from './chat';

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

interface SessionQuery {
  conversationId: string;
  name: string;
}

type SessionWithQueries = BrokerSession & {
  queries?: Record<string, SessionQuery>;
};

export const conversationsService = {
  async getConversations(sessionId: string): Promise<Conversation[]> {
    const [session, events] = await Promise.all([
      apiClient.get<SessionWithQueries>(`/api/v1/broker/sessions/${sessionId}`),
      logsService.getEvents(sessionId, 1000),
    ]);

    if (!session?.conversations) return [];

    const queries = Object.values(session.queries || {});

    const conversations = session.conversations.map((conv: ConversationSummary): Conversation => {
      const conversationQueries = queries.filter((q: SessionQuery) => q.conversationId === conv.conversationId);
      const queryNames = new Set(conversationQueries.map((q: SessionQuery) => q.name));

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
  },

  /**
   * Get messages for a conversation from the Memory Broker.
   */
  async getMessages(conversationId: string): Promise<ConversationMessage[]> {
    const response = await apiClient.get<{ items: ConversationMessage[] }>(
      `/api/v1/broker/messages?conversation_id=${conversationId}`
    );
    return response.items || [];
  },


  async sendMessage(params: {
    conversationId: string;
    message: string;
    sessionId: string;
    agentName: string;
    participantType?: ParticipantType;
    parameters?: QueryParameter[];
  }): Promise<void> {
    const targetName = params.agentName.includes('/')
      ? params.agentName.split('/').pop() || params.agentName
      : params.agentName;

    await chatService.submitChatQuery(
      params.message,
      params.participantType || 'agent',
      targetName,
      params.sessionId,
      params.conversationId,
      undefined,
      undefined,
      params.parameters
    );
  },

};
