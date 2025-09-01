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

// Helper function to build URL parameters
function buildQueryApiParams(filters: MemoryFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.limit) {
    params.append("limit", filters.limit.toString());
  }
  if (filters.page !== undefined) {
    params.append("page", filters.page.toString());
  } else {
    params.append("page", "1");
  }

  return params;
}

// Helper function to convert query to memory message
function queryToMemoryMessage(query: QueryDetailResponse): MemoryMessage | null {
  // Only include queries that have memory configured
  if (!query.spec?.memory?.name || !query.spec?.sessionId) {
    return null;
  }

  const response = query.status?.responses?.[0]?.content || "";
  
  return {
    queryName: query.metadata?.name || query.name,
    queryNamespace: query.metadata?.namespace || query.namespace,
    sessionId: query.spec.sessionId,
    memoryName: query.spec.memory.name,
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

  // Get memory messages by fetching queries with memory
  async getAllSessions(
    namespace: string,
    filters?: MemoryFilters
  ): Promise<{ items: MemoryMessage[]; total: number }> {
    try {
      const params = buildQueryApiParams(filters || {});
      const queryString = params.toString();
      
      const url = `/api/v1/namespaces/${namespace}/queries${
        queryString ? `?${queryString}` : ""
      }`;
      
      const response = await apiClient.get<QueryListResponse>(url);
      
      if (!response?.items) {
        return { items: [], total: 0 };
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

      // Apply filters
      let filteredMessages = memoryMessages;

      if (filters?.memoryName && filters.memoryName !== "all") {
        filteredMessages = filteredMessages.filter(msg => 
          msg.memoryName === filters.memoryName
        );
      }

      if (filters?.sessionId && filters.sessionId !== "all") {
        filteredMessages = filteredMessages.filter(msg => 
          msg.sessionId === filters.sessionId
        );
      }

      // Sort by timestamp (newest first)
      filteredMessages.sort((a, b) => {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });

      return {
        items: filteredMessages,
        total: filteredMessages.length
      };
    } catch (error) {
      console.error("Failed to fetch memory messages:", error);
      return { items: [], total: 0 };
    }
  }
};