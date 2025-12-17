import { apiClient } from '@/lib/api/client';

// Memory message interface - represents individual query messages
export interface MemoryMessage {
  queryName: string;
  queryNamespace: string;
  conversationId: string;
  memoryName: string;
  input: string;
  response?: string;
  timestamp?: string;
  status?: string;
  uid: string;
}

// Stored conversation message from memory service
export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  name?: string;
}

// Conversation data
export interface Conversation {
  conversationId: string;
  memoryName: string;
  messages: StoredMessage[];
  lastUpdated?: string;
}

// Memory resource interface
export interface MemoryResource {
  name: string;
  namespace: string;
  description?: string;
  status?: string;
}

// Memory filters
export interface MemoryFilters {
  memoryName?: string;
  conversationId?: string;
  queryId?: string;
  limit?: number;
  page?: number;
}

// API response interfaces
interface MemoryListResponse {
  items: MemoryResource[];
  total?: number;
}

export type MemoryMessagesFilters = {
  memory?: string;
  conversation?: string;
  query?: string;
};

export const memoryService = {
  // Get all memory resources in a namespace
  async getMemoryResources(): Promise<MemoryResource[]> {
    try {
      const url = `/api/v1/memories`;
      const response = await apiClient.get<MemoryListResponse>(url);

      return response?.items || [];
    } catch (error) {
      console.error('Failed to fetch memory resources:', error);
      return [];
    }
  },

  // Get all conversations across all memories
  async getConversations(): Promise<
    { conversationId: string; memoryName: string }[]
  > {
    try {
      const url = `/api/v1/conversations`;
      const response = await apiClient.get<{
        items: { conversationId: string; memoryName: string }[];
      }>(url);

      return response?.items || [];
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
      return [];
    }
  },

  // Get stored conversation messages for a specific conversation
  async getConversation(
    memoryName: string,
    conversationId: string,
  ): Promise<Conversation | null> {
    try {
      // Use the new ARK API endpoint for memory messages
      const apiUrl = `/api/v1/memories/${memoryName}/conversations/${conversationId}/messages`;
      const response = await apiClient.get<{ messages: StoredMessage[] }>(
        apiUrl,
      );

      return {
        conversationId,
        memoryName,
        messages: response?.messages || [],
        lastUpdated: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Failed to fetch conversation ${conversationId}:`, error);
      return null;
    }
  },

  // Get all memory messages using the new consolidated endpoint
  async getAllMemoryMessages(filters?: MemoryMessagesFilters): Promise<
    {
      timestamp: string;
      memoryName: string;
      conversationId: string;
      queryId: string;
      message: { role: string; content: string; name?: string };
      sequence?: number;
    }[]
  > {
    try {
      let url = `/api/v1/memory-messages`;
      const params = new URLSearchParams();

      if (filters?.memory) params.append('memory', filters.memory);
      if (filters?.conversation)
        params.append('conversation', filters.conversation);
      if (filters?.query) params.append('query', filters.query);

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await apiClient.get<{
        items: {
          timestamp: string;
          memoryName: string;
          conversationId: string;
          queryId: string;
          message: { role: string; content: string; name?: string };
        }[];
      }>(url);
      return response?.items || [];
    } catch (error) {
      console.error('Failed to fetch memory messages:', error);
      return [];
    }
  },

  async deleteConversation(conversationId: string) {
    apiClient.delete(`/api/v1/conversations/${conversationId}`);
  },

  async deleteQuery({
    conversationId,
    queryId,
  }: {
    conversationId: string;
    queryId: string;
  }) {
    apiClient.delete(
      `/api/v1/conversations/${conversationId}/queries/${queryId}/messages`,
    );
  },

  async resetMemory() {
    apiClient.delete('/api/v1/conversations');
  },
};
