import { apiClient } from "@/lib/api/client";

// Memory message interface - represents individual query messages  
export interface MemoryMessage {
  queryName: string;
  queryNamespace: string;
  sessionId: string;
  memoryName: string;
  input: string;
  response?: string;
  timestamp?: string;
  status?: string;
  uid: string;
}

// Stored conversation message from memory service
export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  name?: string;
}

// Session conversation data
export interface SessionConversation {
  sessionId: string;
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
  sessionId?: string;
  queryId?: string;
  limit?: number;
  page?: number;
}

// API response interfaces
interface MemoryListResponse {
  items: MemoryResource[];
  total?: number;
}






export const memoryService = {
  // Get all memory resources in a namespace
  async getMemoryResources(namespace: string): Promise<MemoryResource[]> {
    try {
      const url = `/api/v1/namespaces/${namespace}/memories`;
      const response = await apiClient.get<MemoryListResponse>(url);
      
      return response?.items || [];
    } catch (error) {
      console.error("Failed to fetch memory resources:", error);
      return [];
    }
  },

  // Get all sessions across all memories
  async getSessions(namespace: string): Promise<{ sessionId: string; memoryName: string }[]> {
    try {
      const url = `/api/v1/namespaces/${namespace}/sessions`;
      const response = await apiClient.get<{ items: { sessionId: string; memoryName: string }[] }>(url);
      
      return response?.items || [];
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
      return [];
    }
  },

  // Get stored conversation messages for a specific session
  async getSessionConversation(
    namespace: string,
    memoryName: string,
    sessionId: string
  ): Promise<SessionConversation | null> {
    try {
      // Use the new ARK API endpoint for memory messages
      const apiUrl = `/api/v1/namespaces/${namespace}/memories/${memoryName}/sessions/${sessionId}/messages`;
      const response = await apiClient.get<{ messages: StoredMessage[] }>(apiUrl);
      
      return {
        sessionId,
        memoryName,
        messages: response?.messages || [],
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Failed to fetch conversation for session ${sessionId}:`, error);
      return null;
    }
  },

  // Get all memory messages using the new consolidated endpoint
  async getAllMemoryMessages(
    namespace: string,
    filters?: { memory?: string; session?: string; query?: string }
  ): Promise<{
    timestamp: string;
    memoryName: string;
    sessionId: string;
    queryId: string;
    message: { role: string; content: string; name?: string };
    sequence?: number;
  }[]> {
    try {
      let url = `/api/v1/namespaces/${namespace}/memory-messages`;
      const params = new URLSearchParams();
      
      if (filters?.memory) params.append('memory', filters.memory);
      if (filters?.session) params.append('session', filters.session);
      if (filters?.query) params.append('query', filters.query);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await apiClient.get<{
        items: {
          timestamp: string;
          memoryName: string;
          sessionId: string;
          queryId: string;
          message: { role: string; content: string; name?: string };
        }[];
      }>(url);
      return response?.items || [];
    } catch (error) {
      console.error("Failed to fetch memory messages:", error);
      return [];
    }
  }
};