import { describe, it, expect, beforeEach, vi } from 'vitest';
import { brokerSessionsService } from '@/lib/services/broker-sessions';
import type { BrokerSession, PaginatedSessions, SessionsListParams } from '@/lib/services/broker-sessions';
import { apiClient } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('brokerSessionsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSessions', () => {
    it('should fetch sessions without params', async () => {
      const mockResponse: PaginatedSessions = {
        items: [
          {
            sessionId: 'session-1',
            name: 'Test Session',
            status: 'active',
            errorCount: 0,
            participants: [],
            conversationCount: 2,
            createdAt: '2024-01-01T00:00:00Z',
            lastActivity: '2024-01-01T01:00:00Z',
          },
        ],
        total: 1,
        hasMore: false,
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      const result = await brokerSessionsService.getSessions();

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/broker/sessions');
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should build query params correctly', async () => {
      const params: SessionsListParams = {
        limit: 20,
        cursor: 10,
        status: 'active',
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31',
        search: 'test',
        sort: 'date',
        order: 'desc',
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce({
        items: [],
        total: 0,
        hasMore: false,
      });

      await brokerSessionsService.getSessions(params);

      const expectedUrl = '/api/v1/broker/sessions?limit=20&cursor=10&status=active&dateFrom=2024-01-01&dateTo=2024-01-31&search=test&sort=date&order=desc';
      expect(apiClient.get).toHaveBeenCalledWith(expectedUrl);
    });

    it('should omit undefined params from query string', async () => {
      const params: SessionsListParams = {
        limit: 10,
        status: undefined,
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce({
        items: [],
        total: 0,
        hasMore: false,
      });

      await brokerSessionsService.getSessions(params);

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/broker/sessions?limit=10');
    });

    it('should handle session data from backend', async () => {
      const mockResponse = {
        items: [
          {
            sessionId: 'session-1',
            name: 'Test Session',
            status: 'active',
            errorCount: 0,
            participants: [
              {
                id: 'p1',
                name: 'test-agent',
                type: 'agent',
              },
            ],
            conversations: [
              {
                conversationId: 'conv-1',
                name: 'test-agent',
                participants: ['test-agent'],
                messageCount: 2,
                duration: '1m',
                startTime: '2024-01-01T00:00:00Z',
                participantType: 'agent',
                errorCount: 0,
              },
            ],
            createdAt: '2024-01-01T00:00:00Z',
            lastActivity: '2024-01-01T01:00:00Z',
          },
        ],
        total: 1,
        hasMore: false,
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      const result = await brokerSessionsService.getSessions();

      expect(result.items[0].status).toBe('active');
      expect(result.items[0].conversationCount).toBe(1);
      expect(result.items[0].participants).toHaveLength(1);
      expect(result.items[0].participants[0]).toMatchObject({
        name: 'test-agent',
        type: 'agent',
      });
    });

    it('should handle error status from backend', async () => {
      const mockResponse = {
        items: [
          {
            sessionId: 'session-1',
            name: 'Test Session',
            status: 'error',
            errorCount: 1,
            participants: [],
            conversations: [],
            createdAt: '2024-01-01T00:00:00Z',
            lastActivity: '2024-01-01T01:00:00Z',
          },
        ],
        total: 1,
        hasMore: false,
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      const result = await brokerSessionsService.getSessions();

      expect(result.items[0].status).toBe('error');
      expect(result.items[0].errorCount).toBe(1);
    });

    it('should handle empty response', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(null);

      const result = await brokerSessionsService.getSessions();

      expect(result).toEqual({
        items: [],
        total: 0,
        hasMore: false,
        nextCursor: undefined,
      });
    });

    it('should handle invalid response format', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({ invalid: 'response' });

      const result = await brokerSessionsService.getSessions();

      expect(result).toEqual({
        items: [],
        total: 0,
        hasMore: false,
        nextCursor: undefined,
      });
    });

    it('should handle participant types from backend', async () => {
      const mockResponse = {
        items: [
          {
            sessionId: 'session-1',
            name: 'Test Session',
            status: 'idle',
            errorCount: 0,
            participants: [
              {
                id: 'p1',
                name: 'test-team',
                type: 'team',
              },
              {
                id: 'p2',
                name: 'test-tool',
                type: 'tool',
              },
            ],
            conversations: [],
            createdAt: '2024-01-01T00:00:00Z',
            lastActivity: '2024-01-01T01:00:00Z',
          },
        ],
        total: 1,
        hasMore: false,
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      const result = await brokerSessionsService.getSessions();

      expect(result.items[0].participants).toHaveLength(2);
      expect(result.items[0].participants[0].type).toBe('team');
      expect(result.items[0].participants[1].type).toBe('tool');
    });
  });

  describe('getSession', () => {
    it('should fetch a single session by ID', async () => {
      const mockSession = {
        sessionId: 'session-1',
        name: 'Test Session',
        createdAt: '2024-01-01T00:00:00Z',
        lastActivity: '2024-01-01T01:00:00Z',
        queries: {
          'query-1': {
            name: 'query-1',
            agent: 'test-agent',
            phase: 'done',
            conversationId: 'conv-1',
            createdAt: '2024-01-01T00:00:00Z',
            lastActivity: '2024-01-01T00:30:00Z',
            completedAt: '2024-01-01T00:30:00Z',
          },
        },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

      const result = await brokerSessionsService.getSession('session-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/broker/sessions/session-1');
      expect(result).toMatchObject({
        sessionId: 'session-1',
        name: 'Test Session',
        status: 'idle',
      });
    });

    it('should return null when session not found', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(null);

      const result = await brokerSessionsService.getSession('non-existent');

      expect(result).toBeNull();
    });

    it('should calculate conversation count from conversations array', async () => {
      const mockSession = {
        sessionId: 'session-1',
        name: 'Test Session',
        status: 'idle',
        errorCount: 0,
        participants: [],
        conversations: [
          {
            conversationId: 'conv-1',
            name: 'test-agent',
            participants: ['test-agent'],
            messageCount: 2,
            duration: '1m',
            startTime: '2024-01-01T00:00:00Z',
            participantType: 'agent',
            errorCount: 0,
          },
          {
            conversationId: 'conv-2',
            name: 'test-agent',
            participants: ['test-agent'],
            messageCount: 1,
            duration: '30s',
            startTime: '2024-01-01T00:30:00Z',
            participantType: 'agent',
            errorCount: 0,
          },
        ],
        createdAt: '2024-01-01T00:00:00Z',
        lastActivity: '2024-01-01T01:00:00Z',
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

      const result = await brokerSessionsService.getSession('session-1');

      expect(result?.conversationCount).toBe(2);
    });

    it('should handle error count from backend', async () => {
      const mockSession = {
        sessionId: 'session-1',
        name: 'Test Session',
        status: 'error',
        errorCount: 2,
        participants: [],
        conversations: [],
        createdAt: '2024-01-01T00:00:00Z',
        lastActivity: '2024-01-01T01:00:00Z',
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

      const result = await brokerSessionsService.getSession('session-1');

      expect(result?.errorCount).toBe(2);
    });
  });
});
