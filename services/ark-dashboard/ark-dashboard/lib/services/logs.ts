import { apiClient } from '@/lib/api/client';

export interface LogEvent {
  timestamp: string;
  eventType: string;
  reason: string;
  message: string;
  data: {
    queryId: string;
    queryName: string;
    queryNamespace: string;
    sessionId: string;
    conversationId?: string;
    operation?: string;
    durationMs?: string;
    error?: string;
    [key: string]: unknown;
  };
}

export interface LogsResponse {
  items: LogEvent[];
  total: number;
  hasMore: boolean;
  nextCursor?: number;
}

export const logsService = {
  async getEvents(sessionId: string, limit = 100, cursor?: number): Promise<LogsResponse> {
    const response = await apiClient.get<LogsResponse>(
      `/api/v1/broker/events`,
      {
        params: {
          session_id: sessionId,
          limit,
          ...(cursor !== undefined && { cursor }),
        },
      }
    );
    return response;
  },
};
