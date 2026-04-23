import { apiClient } from '@/lib/api/client';
import type { ChatMessage } from '@/lib/types/chat-message';

export interface Conversation {
  conversationId: string;
  name: string;
  participants: string[];
  messageCount: number;
  toolCallCount: number;
  tokens: number;
  duration: string;
  status: 'active' | 'completed' | 'error';
  startTime: string;
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
    const session = await apiClient.get<any>(`/api/v1/broker/sessions/${sessionId}`);
    if (!session) return [];

    const queries = Object.values(session.queries || {});
    const conversationMap = new Map<string, any[]>();

    queries.forEach((query: any) => {
      if (!query.conversationId) return;
      const existing = conversationMap.get(query.conversationId) || [];
      conversationMap.set(query.conversationId, [...existing, query]);
    });

    const conversations = Array.from(conversationMap.entries()).map(([convId, queries]): Conversation => {
      const hasError = queries.some(q => q.phase === 'error');
      const isActive = queries.some(q => q.phase === 'running' || q.phase === 'pending');

      const participants = Array.from(new Set(queries.map(q => q.agent || q.team).filter(Boolean))) as string[];
      const participantName = participants[0] || convId;

      const messageCount = queries.length;
      const toolCallCount = 0;

      const status: 'active' | 'completed' | 'error' = hasError ? 'error' : isActive ? 'active' : 'completed';

      return {
        conversationId: convId,
        name: participantName,
        participants,
        messageCount,
        toolCallCount,
        tokens: 0,
        duration: calculateDuration(queries[0].createdAt, queries[queries.length - 1].completedAt),
        status,
        startTime: queries[0].createdAt,
      };
    });

    return conversations;
  },

  /**
   * Get messages for a conversation from the Memory Broker.
   */
  async getMessages(sessionId: string, conversationId: string): Promise<ConversationMessage[]> {
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
  }): Promise<void> {
    const { chatService } = await import('./chat');
    await chatService.submitChatQuery(
      params.message,
      'agent',
      params.agentName,
      params.sessionId,
      params.conversationId
    );
  },
};

function calculateDuration(start: string, end?: string): string {
  if (!end) return 'ongoing';
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}
