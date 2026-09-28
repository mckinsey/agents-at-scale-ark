import { apiClient } from '@/lib/api/client';
import type { ChatMessage } from '@/lib/types/chat-message';
import type { BrokerSession, ConversationSummary } from './broker-sessions';
import { logsService } from './logs';

export type ParticipantType = 'agent' | 'team' | 'tool';

const MESSAGES_PAGE_SIZE = 500;

export interface Conversation {
  conversationId: string;
  name: string;
  participants: string[];
  messageCount: number;
  toolCallCount: number;
  duration: string;
  startTime: string;
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

interface ConversationMessagePage {
  items: ConversationMessage[];
  hasMore: boolean;
  nextCursor?: number;
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
      // Get all queries associated with this conversation
      const conversationQueries = queries.filter((q: SessionQuery) => q.conversationId === conv.conversationId);
      const queryNames = new Set(conversationQueries.map((q: SessionQuery) => q.name));

      // Internal tools that shouldn't be counted (team coordination)
      const internalTools = new Set(['select-next-speaker']);

      const toolCallCount = events
        ? events.items.filter(e => {
            if (e.reason !== 'ToolCallComplete') return false;

            // Filter by query name (original approach)
            if (!queryNames.has(e.data.queryName)) return false;

            // Exclude internal tools (new addition)
            const toolName = e.data.toolName;
            if (!toolName || typeof toolName !== 'string') return false;

            return !internalTools.has(toolName);
          }).length
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
  async getMessages(
    conversationId: string,
    afterSequence?: number
  ): Promise<ConversationMessage[]> {
    const messages: ConversationMessage[] = [];
    let cursor = afterSequence;

    for (;;) {
      const response = await apiClient.get<ConversationMessagePage>(
        '/api/v1/broker/messages',
        {
          params: {
            conversation_id: conversationId,
            limit: MESSAGES_PAGE_SIZE,
            ...(cursor !== undefined && { cursor }),
          },
        }
      );

      messages.push(...(response.items || []));

      if (!response.hasMore || response.nextCursor === undefined) {
        return messages;
      }
      cursor = response.nextCursor;
    }
  },
};
