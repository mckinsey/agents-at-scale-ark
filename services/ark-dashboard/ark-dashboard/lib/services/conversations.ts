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
  status: 'active' | 'completed' | 'error';
  startTime: string;
  isTemporary?: boolean;
  participantType?: ParticipantType;
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
      if (!session) return [];

      const queries = Object.values(session.queries || {});
      const conversationMap = new Map<string, any[]>();

      queries.forEach((query: any) => {
        if (!query.conversationId) return;
        const existing = conversationMap.get(query.conversationId) || [];
        conversationMap.set(query.conversationId, [...existing, query]);
      });

      // Fetch events for tool call counting
      const { logsService } = await import('./logs');
      const events = await logsService.getEvents(sessionId, 1000);

      const conversations = Array.from(conversationMap.entries()).map(([convId, queries]): Conversation => {
        const hasError = queries.some(q => q.phase === 'error');
        const isActive = queries.some(q => q.phase === 'running' || q.phase === 'pending');

        const participants = Array.from(new Set(queries.map(q => q.team || q.agent || q.tool).filter(Boolean))) as string[];
        const participantName = participants[0] || convId;

        // Determine participant type from queries
        const firstQuery = queries[0];
        let participantType: ParticipantType = 'agent';
        if (firstQuery.team) {
          participantType = 'team';
        } else if (firstQuery.tool) {
          participantType = 'tool';
        }

        const messageCount = queries.length;

        // Count tool calls from events
        const queryNames = new Set(queries.map((q: any) => q.name));
        const toolCallCount = events
          ? events.items.filter(e =>
              e.reason === 'ToolCallComplete' &&
              queryNames.has(e.data.queryName)
            ).length
          : 0;

        let status: 'active' | 'completed' | 'error';
        if (hasError) {
          status = 'error';
        } else if (isActive) {
          status = 'active';
        } else {
          status = 'completed';
        }

        return {
          conversationId: convId,
          name: participantName,
          participants,
          messageCount,
          toolCallCount,
          duration: calculateDuration(queries.at(0)!.createdAt, queries.at(-1)!.completedAt),
          status,
          startTime: queries.at(0)!.createdAt,
          participantType,
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

function calculateDuration(start: string, end?: string): string {
  if (!end) return 'ongoing';
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}
