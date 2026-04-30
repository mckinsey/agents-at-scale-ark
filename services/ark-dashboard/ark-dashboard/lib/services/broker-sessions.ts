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
  sort?: 'date' | 'name' | 'conversations';
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

    const queryString = queryParams.toString();
    const url = queryString
      ? `/api/v1/broker/sessions?${queryString}`
      : '/api/v1/broker/sessions';
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

function getSessionStatus(errorCount: number, isActive: boolean): 'error' | 'active' | 'idle' {
  if (errorCount > 0) return 'error';
  if (isActive) return 'active';
  return 'idle';
}

function determineParticipantType(queries: any[], participantName: string): 'agent' | 'team' | 'tool' {
  // Find a query that mentions this participant
  const relevantQuery = queries.find((q: any) =>
    q.team === participantName || q.agent === participantName || q.tool === participantName
  );

  if (!relevantQuery) return 'agent'; // Default fallback

  // If targetType is explicitly set, use it
  if (relevantQuery.targetType === 'team') return 'team';
  if (relevantQuery.targetType === 'tool') return 'tool';

  // If team field is set and matches, it's a team
  if (relevantQuery.team === participantName) return 'team';

  // If tool field is set and matches, it's a tool
  if (relevantQuery.tool === participantName) return 'tool';

  // Otherwise it's an agent
  return 'agent';
}

function enrichSessionData(session: any): BrokerSession {
  const queries = Object.values(session.queries || {});
  const errors = queries.filter((q: any) => q.phase === 'error');

  // Group queries by conversationId
  const conversationMap = new Map<string, any[]>();
  queries.forEach((q: any) => {
    if (q.conversationId) {
      const existing = conversationMap.get(q.conversationId) || [];
      conversationMap.set(q.conversationId, [...existing, q]);
    }
  });

  // Determine status from the last conversation's last query
  let hasErrorInLastConversation = false;
  let active = false;

  if (conversationMap.size > 0) {
    // Find the conversation with the most recent activity
    let lastConversationQueries: any[] = [];
    let latestActivity = 0;

    conversationMap.forEach((convQueries) => {
      const convLatestActivity = Math.max(
        ...convQueries.map((q) => new Date(q.lastActivity).getTime())
      );
      if (convLatestActivity > latestActivity) {
        latestActivity = convLatestActivity;
        lastConversationQueries = convQueries;
      }
    });

    // Check the last query in the last conversation
    if (lastConversationQueries.length > 0) {
      const sortedQueries = [...lastConversationQueries].sort(
        (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
      );
      const lastQuery = sortedQueries[0];
      hasErrorInLastConversation = lastQuery.phase === 'error';
      active = lastQuery.phase === 'running' || lastQuery.phase === 'pending';
    }
  } else {
    // Fallback: if no conversations, check all queries (original behavior)
    active = queries.some((q: any) => q.phase === 'running' || q.phase === 'pending');
  }

  const participants = Array.from(
    new Set(queries.map((q: any) => q.team || q.agent || q.tool).filter(Boolean))
  ).map((name) => ({
    id: name as string,
    name: name as string,
    type: determineParticipantType(queries, name),
    isActive: queries.some((q: any) => (q.team || q.agent || q.tool) === name && q.phase === 'running')
  }));

  const conversations = Array.from(
    new Set(queries.map((q: any) => q.conversationId).filter(Boolean))
  );

  return {
    sessionId: session.sessionId,
    name: session.name || session.sessionId,
    status: getSessionStatus(hasErrorInLastConversation ? 1 : 0, active),
    errorCount: errors.length,
    participants,
    conversationCount: conversations.length,
    createdAt: session.createdAt,
    lastActivity: session.lastActivity,
  };
}
