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
  limit?: number;
  page?: number;
}

// API response interfaces
interface MemoryListResponse {
  items: MemoryResource[];
  total?: number;
}

interface QueryListResponse {
  items: QueryResponse[];
  total?: number;
}

interface QueryResponse {
  name: string;
  namespace: string;
  input: string;
  status?: {
    phase?: string;
    responses?: Array<{ content: string }>;
  };
  creationTimestamp?: string;
}

interface QueryDetailResponse extends QueryResponse {
  sessionId?: string;
  memory?: { name: string; namespace?: string };
  spec?: {
    memory?: { name: string };
    sessionId?: string;
    input: string;
  };
  metadata?: {
    name: string;
    namespace: string;
    uid: string;
    creationTimestamp?: string;
  };
}


// Helper function to convert query to memory message
function queryToMemoryMessage(query: QueryDetailResponse): MemoryMessage | null {
  // Check for memory configuration in both top-level and spec fields
  const memoryName = query.memory?.name || query.spec?.memory?.name;
  const sessionId = query.sessionId || query.spec?.sessionId;
  
  if (!memoryName || !sessionId) {
    return null;
  }

  const response = query.status?.responses?.[0]?.content || "";
  
  return {
    queryName: query.metadata?.name || query.name,
    queryNamespace: query.metadata?.namespace || query.namespace,
    sessionId: sessionId,
    memoryName: memoryName,
    input: query.spec?.input || query.input,
    response: response,
    timestamp: query.metadata?.creationTimestamp || query.creationTimestamp,
    status: query.status?.phase || "unknown",
    uid: query.metadata?.uid || ""
  };
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

  // Get memory-enabled queries (used to discover sessions)
  async getMemoryEnabledQueries(
    namespace: string
  ): Promise<MemoryMessage[]> {
    try {
      const url = `/api/v1/namespaces/${namespace}/queries`;
      const response = await apiClient.get<QueryListResponse>(url);
      
      if (!response?.items) {
        return [];
      }

      // Get detailed info for each query to check for memory config
      const detailedQueries = await Promise.all(
        response.items.map(async (query) => {
          try {
            const detailUrl = `/api/v1/namespaces/${namespace}/queries/${query.name}`;
            return await apiClient.get<QueryDetailResponse>(detailUrl);
          } catch (error) {
            console.warn(`Failed to fetch details for query ${query.name}:`, error);
            return null;
          }
        })
      );

      // Convert to memory messages and filter
      const memoryMessages = detailedQueries
        .filter(Boolean)
        .map(query => queryToMemoryMessage(query!))
        .filter(Boolean) as MemoryMessage[];

      return memoryMessages;
    } catch (error) {
      console.error("Failed to fetch memory-enabled queries:", error);
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
      // Use the memory API proxy route
      const apiUrl = `/api/memory/messages/${encodeURIComponent(sessionId)}?namespace=${namespace}&memoryName=${memoryName}`;
      
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

  // Get all session conversations for memory resources
  async getAllConversations(
    namespace: string,
    filters?: MemoryFilters
  ): Promise<{ conversations: SessionConversation[]; memoryQueries: MemoryMessage[] }> {
    try {
      // Get all memory-enabled queries to discover sessions
      const memoryQueries = await this.getMemoryEnabledQueries(namespace);
      
      if (memoryQueries.length === 0) {
        return { conversations: [], memoryQueries: [] };
      }

      // Get unique session/memory combinations
      const sessionCombinations = new Map<string, { sessionId: string; memoryName: string }>();
      
      memoryQueries.forEach(msg => {
        const key = `${msg.memoryName}:${msg.sessionId}`;
        if (!sessionCombinations.has(key)) {
          sessionCombinations.set(key, {
            sessionId: msg.sessionId,
            memoryName: msg.memoryName
          });
        }
      });

      // Apply filters to session combinations
      let filteredCombinations = Array.from(sessionCombinations.values());

      if (filters?.memoryName && filters.memoryName !== "all") {
        filteredCombinations = filteredCombinations.filter(combo => 
          combo.memoryName === filters.memoryName
        );
      }

      if (filters?.sessionId && filters.sessionId !== "all") {
        filteredCombinations = filteredCombinations.filter(combo => 
          combo.sessionId === filters.sessionId
        );
      }

      // Fetch conversations for each unique session
      const conversations = await Promise.all(
        filteredCombinations.map(({ sessionId, memoryName }) =>
          this.getSessionConversation(namespace, memoryName, sessionId)
        )
      );

      return { 
        conversations: conversations.filter(Boolean) as SessionConversation[],
        memoryQueries: memoryQueries
      };
    } catch (error) {
      console.error("Failed to fetch all conversations:", error);
      return { conversations: [], memoryQueries: [] };
    }
  }
};