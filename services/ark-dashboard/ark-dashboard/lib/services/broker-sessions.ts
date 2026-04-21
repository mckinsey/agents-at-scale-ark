import { apiClient } from '@/lib/api/client';

function buildQueryParams<T extends Record<string, any>>(params: T): URLSearchParams {
  const queryParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      queryParams.append(key, String(value));
    }
  });

  return queryParams;
}

export interface BrokerSession {
  sessionId: string;
  name: string;
  status: 'active' | 'idle' | 'error';
  errorCount: number;
  participants: Participant[];
  conversationCount: number;
  totalTokens: number;
  createdAt: string;
  lastActivity: string;
}

export interface Participant {
  id: string;
  name: string;
  type: 'agent' | 'team' | 'tool';
  isActive: boolean;
}

export interface SessionsListParams {
  limit?: number;
  cursor?: number;
  status?: 'active' | 'idle' | 'error';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sort?: 'date' | 'tokens';
  order?: 'asc' | 'desc';
}

export interface PaginatedSessions {
  items: BrokerSession[];
  total: number;
  hasMore: boolean;
  nextCursor?: number;
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

    const url = `/api/v1/broker/sessions${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await apiClient.get<PaginatedSessions>(url);

    if (!response || !Array.isArray(response.items)) {
      return {
        items: [],
        total: 0,
        hasMore: false,
        nextCursor: undefined,
      };
    }

    return {
      items: response.items.map(session => enrichSessionData(session)),
      total: response.total ?? 0,
      hasMore: response.hasMore ?? false,
      nextCursor: response.nextCursor,
    };
  },

  async getSession(sessionId: string): Promise<BrokerSession | null> {
    const response = await apiClient.get<any>(`/api/v1/broker/sessions/${sessionId}`);
    if (!response) {
      return null;
    }
    return enrichSessionData(response);
  },
};

function enrichSessionData(session: any): BrokerSession {
  const queries = Object.values(session.queries || {});
  const errors = queries.filter((q: any) => q.phase === 'error');
  const active = queries.some((q: any) => q.phase === 'running' || q.phase === 'pending');

  const participants = Array.from(
    new Set(queries.map((q: any) => q.agent || q.team).filter(Boolean))
  ).map((name) => ({
    id: name as string,
    name: name as string,
    type: 'agent' as const,
    isActive: queries.some((q: any) => (q.agent || q.team) === name && q.phase === 'running')
  }));

  const conversations = Array.from(
    new Set(queries.map((q: any) => q.conversationId).filter(Boolean))
  );

  return {
    sessionId: session.sessionId,
    name: session.name || session.sessionId,
    status: errors.length > 0 ? 'error' : active ? 'active' : 'idle',
    errorCount: errors.length,
    participants,
    conversationCount: conversations.length,
    totalTokens: 0,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity,
  };
}
