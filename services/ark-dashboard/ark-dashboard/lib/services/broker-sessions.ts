import { apiClient } from '@/lib/api/client';

function buildQueryParams(params: Partial<SessionsListParams>): URLSearchParams {
  const queryParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.append(key, String(value));
    }
  });

  return queryParams;
}

export interface Participant {
  id: string;
  name: string;
  type: 'agent' | 'team' | 'tool';
}

export interface ConversationSummary {
  conversationId: string;
  name: string;
  participants: string[];
  messageCount: number;
  duration: string;
  startTime: string;
  participantType: 'agent' | 'team' | 'tool';
  errorCount: number;
}

export interface BrokerSession {
  sessionId: string;
  name: string;
  status: 'active' | 'idle' | 'error';
  errorCount: number;
  participants: Participant[];
  conversations?: ConversationSummary[];
  conversationCount: number;
  createdAt: string;
  lastActivity: string;
}

export interface SessionsListParams {
  limit?: number;
  cursor?: number;
  status?: 'active' | 'idle' | 'error';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sort?: 'date' | 'name' | 'conversations';
  order?: 'asc' | 'desc';
}

export interface PaginatedSessions {
  items: BrokerSession[];
  total: number;
  hasMore: boolean;
  nextCursor?: number;
  statusCounts?: {
    active: number;
    idle: number;
    error: number;
  };
}

export const brokerSessionsService = {
  async getSessions(params?: SessionsListParams): Promise<PaginatedSessions> {
    const queryParams = buildQueryParams({
      limit: params?.limit,
      cursor: params?.cursor,
      status: params?.status,
      dateFrom: params?.dateFrom,
      dateTo: params?.dateTo,
      search: params?.search,
      sort: params?.sort,
      order: params?.order,
    });

    const queryString = queryParams.toString();
    const url = queryString
      ? `/api/v1/broker/sessions?${queryString}`
      : '/api/v1/broker/sessions';
    const response = await apiClient.get<PaginatedSessions>(url);

    if (!response || !Array.isArray(response.items)) {
      console.error('Malformed sessions API response:', {
        url,
        hasResponse: !!response,
        itemsType: response ? typeof response.items : 'no response',
        response,
      });
      return {
        items: [],
        total: 0,
        hasMore: false,
        nextCursor: undefined,
      };
    }

    return {
      items: response.items.map(session => ({
        ...session,
        status: session.status ?? 'idle',
        errorCount: session.errorCount ?? 0,
        participants: session.participants ?? [],
        conversations: session.conversations ?? [],
        conversationCount: session.conversations?.length ?? 0,
      })),
      total: response.total ?? 0,
      hasMore: response.hasMore ?? false,
      nextCursor: response.nextCursor,
      statusCounts: response.statusCounts,
    };
  },

  async getSession(sessionId: string): Promise<BrokerSession | null> {
    const response = await apiClient.get<BrokerSession>(`/api/v1/broker/sessions/${sessionId}`);
    if (!response) {
      console.error('Malformed session API response:', {
        url: `/api/v1/broker/sessions/${sessionId}`,
        sessionId,
        response,
      });
      return null;
    }
    return {
      ...response,
      status: response.status ?? 'idle',
      errorCount: response.errorCount ?? 0,
      participants: response.participants ?? [],
      conversations: response.conversations ?? [],
      conversationCount: response.conversations?.length ?? 0,
    };
  },
};
