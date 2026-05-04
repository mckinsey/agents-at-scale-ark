import { describe, it, expect, beforeEach, vi } from 'vitest';
import { conversationsService } from '@/lib/services/conversations';
import type { Conversation, ConversationMessage } from '@/lib/services/conversations';
import { apiClient } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/services/logs', () => ({
  logsService: {
    getEvents: vi.fn(),
  },
}));

vi.mock('@/lib/services/chat', () => ({
  chatService: {
    submitChatQuery: vi.fn(),
  },
}));

describe('conversationsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getConversations', () => {
    it('should fetch conversations from session queries', async () => {
      const mockSession = {
        sessionId: 'session-1',
        queries: {
          'query-1': {
            name: 'query-1',
            agent: 'test-agent',
            phase: 'done',
            conversationId: 'conv-1',
            createdAt: '2024-01-01T00:00:00Z',
            lastActivity: '2024-01-01T00:30:00Z',
          },
          'query-2': {
            name: 'query-2',
            agent: 'test-agent',
            phase: 'done',
            conversationId: 'conv-2',
            createdAt: '2024-01-01T00:30:00Z',
            lastActivity: '2024-01-01T01:00:00Z',
          },
        },
      };

      const mockEvents = {
        items: [
          {
            reason: 'ToolCallComplete',
            data: { queryName: 'query-1' },
          },
        ],
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

      const { logsService } = await import('@/lib/services/logs');
      vi.mocked(logsService.getEvents).mockResolvedValueOnce(mockEvents as any);

      const result = await conversationsService.getConversations('session-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/broker/sessions/session-1');
      expect(result).toHaveLength(2);
      expect(result[0].conversationId).toBe('conv-1');
      expect(result[1].conversationId).toBe('conv-2');
    });

    it('should group queries by conversationId', async () => {
      const mockSession = {
        sessionId: 'session-1',
        queries: {
          'query-1': {
            name: 'query-1',
            agent: 'test-agent',
            phase: 'done',
            conversationId: 'conv-1',
            createdAt: '2024-01-01T00:00:00Z',
            lastActivity: '2024-01-01T00:30:00Z',
          },
          'query-2': {
            name: 'query-2',
            agent: 'test-agent',
            phase: 'done',
            conversationId: 'conv-1',
            createdAt: '2024-01-01T00:30:00Z',
            lastActivity: '2024-01-01T01:00:00Z',
          },
        },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

      const { logsService } = await import('@/lib/services/logs');
      vi.mocked(logsService.getEvents).mockResolvedValueOnce({ items: [] } as any);

      const result = await conversationsService.getConversations('session-1');

      expect(result).toHaveLength(1);
      expect(result[0].messageCount).toBe(2);
    });

    it('should determine status from last query only', async () => {
      const mockSession = {
        sessionId: 'session-1',
        queries: {
          'query-1': {
            name: 'query-1',
            agent: 'test-agent',
            phase: 'done',
            conversationId: 'conv-1',
            createdAt: '2024-01-01T00:00:00Z',
            lastActivity: '2024-01-01T00:30:00Z',
          },
          'query-2': {
            name: 'query-2',
            agent: 'test-agent',
            phase: 'error',
            conversationId: 'conv-1',
            createdAt: '2024-01-01T00:30:00Z',
            lastActivity: '2024-01-01T01:00:00Z',
          },
        },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

      const { logsService } = await import('@/lib/services/logs');
      vi.mocked(logsService.getEvents).mockResolvedValueOnce({ items: [] } as any);

      const result = await conversationsService.getConversations('session-1');

      expect(result[0].status).toBe('error');
    });

    it('should mark conversation as active when last query is running', async () => {
      const mockSession = {
        sessionId: 'session-1',
        queries: {
          'query-1': {
            name: 'query-1',
            agent: 'test-agent',
            phase: 'running',
            conversationId: 'conv-1',
            createdAt: '2024-01-01T00:00:00Z',
            lastActivity: '2024-01-01T00:30:00Z',
          },
        },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

      const { logsService } = await import('@/lib/services/logs');
      vi.mocked(logsService.getEvents).mockResolvedValueOnce({ items: [] } as any);

      const result = await conversationsService.getConversations('session-1');

      expect(result[0].status).toBe('active');
    });

    it('should determine participant type from query fields', async () => {
      const mockSession = {
        sessionId: 'session-1',
        queries: {
          'query-1': {
            name: 'query-1',
            team: 'test-team',
            phase: 'done',
            conversationId: 'conv-1',
            createdAt: '2024-01-01T00:00:00Z',
            lastActivity: '2024-01-01T00:30:00Z',
          },
          'query-2': {
            name: 'query-2',
            tool: 'test-tool',
            phase: 'done',
            conversationId: 'conv-2',
            createdAt: '2024-01-01T00:30:00Z',
            lastActivity: '2024-01-01T01:00:00Z',
          },
        },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

      const { logsService } = await import('@/lib/services/logs');
      vi.mocked(logsService.getEvents).mockResolvedValueOnce({ items: [] } as any);

      const result = await conversationsService.getConversations('session-1');

      expect(result[0].participantType).toBe('team');
      expect(result[1].participantType).toBe('tool');
    });

    it('should count tool calls from events', async () => {
      const mockSession = {
        sessionId: 'session-1',
        queries: {
          'query-1': {
            name: 'query-1',
            agent: 'test-agent',
            phase: 'done',
            conversationId: 'conv-1',
            createdAt: '2024-01-01T00:00:00Z',
            lastActivity: '2024-01-01T00:30:00Z',
          },
        },
      };

      const mockEvents = {
        items: [
          {
            reason: 'ToolCallComplete',
            data: { queryName: 'query-1' },
          },
          {
            reason: 'ToolCallComplete',
            data: { queryName: 'query-1' },
          },
          {
            reason: 'ToolCallComplete',
            data: { queryName: 'other-query' },
          },
        ],
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

      const { logsService } = await import('@/lib/services/logs');
      vi.mocked(logsService.getEvents).mockResolvedValueOnce(mockEvents as any);

      const result = await conversationsService.getConversations('session-1');

      expect(result[0].toolCallCount).toBe(2);
    });

    it('should calculate duration for completed conversations', async () => {
      const mockSession = {
        sessionId: 'session-1',
        queries: {
          'query-1': {
            name: 'query-1',
            agent: 'test-agent',
            phase: 'done',
            conversationId: 'conv-1',
            createdAt: '2024-01-01T00:00:00Z',
            lastActivity: '2024-01-01T00:01:30Z',
            completedAt: '2024-01-01T00:01:30Z',
          },
        },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

      const { logsService } = await import('@/lib/services/logs');
      vi.mocked(logsService.getEvents).mockResolvedValueOnce({ items: [] } as any);

      const result = await conversationsService.getConversations('session-1');

      expect(result[0].duration).toBe('1m 30s');
    });

    it('should show ongoing for active conversations', async () => {
      const mockSession = {
        sessionId: 'session-1',
        queries: {
          'query-1': {
            name: 'query-1',
            agent: 'test-agent',
            phase: 'running',
            conversationId: 'conv-1',
            createdAt: '2024-01-01T00:00:00Z',
            lastActivity: '2024-01-01T00:01:30Z',
          },
        },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

      const { logsService } = await import('@/lib/services/logs');
      vi.mocked(logsService.getEvents).mockResolvedValueOnce({ items: [] } as any);

      const result = await conversationsService.getConversations('session-1');

      expect(result[0].duration).toBe('ongoing');
    });

    it('should count errors correctly', async () => {
      const mockSession = {
        sessionId: 'session-1',
        queries: {
          'query-1': {
            name: 'query-1',
            agent: 'test-agent',
            phase: 'error',
            conversationId: 'conv-1',
            createdAt: '2024-01-01T00:00:00Z',
            lastActivity: '2024-01-01T00:30:00Z',
          },
          'query-2': {
            name: 'query-2',
            agent: 'test-agent',
            phase: 'error',
            conversationId: 'conv-1',
            createdAt: '2024-01-01T00:30:00Z',
            lastActivity: '2024-01-01T01:00:00Z',
          },
        },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

      const { logsService } = await import('@/lib/services/logs');
      vi.mocked(logsService.getEvents).mockResolvedValueOnce({ items: [] } as any);

      const result = await conversationsService.getConversations('session-1');

      expect(result[0].errorCount).toBe(2);
    });

    it('should handle session not found', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce(null);

      const result = await conversationsService.getConversations('non-existent');

      expect(result).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Network error'));

      const result = await conversationsService.getConversations('session-1');

      expect(result).toEqual([]);
    });

    it('should ignore queries without conversationId', async () => {
      const mockSession = {
        sessionId: 'session-1',
        queries: {
          'query-1': {
            name: 'query-1',
            agent: 'test-agent',
            phase: 'done',
            createdAt: '2024-01-01T00:00:00Z',
            lastActivity: '2024-01-01T00:30:00Z',
          },
        },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

      const { logsService } = await import('@/lib/services/logs');
      vi.mocked(logsService.getEvents).mockResolvedValueOnce({ items: [] } as any);

      const result = await conversationsService.getConversations('session-1');

      expect(result).toEqual([]);
    });
  });

  describe('getMessages', () => {
    it('should fetch messages for a conversation', async () => {
      const mockMessages: ConversationMessage[] = [
        {
          timestamp: '2024-01-01T00:00:00Z',
          conversation_id: 'conv-1',
          query_id: 'query-1',
          message: { role: 'user', content: 'Hello' },
          sequence: 1,
        },
        {
          timestamp: '2024-01-01T00:00:10Z',
          conversation_id: 'conv-1',
          query_id: 'query-1',
          message: { role: 'assistant', content: 'Hi there!' },
          sequence: 2,
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValueOnce({ items: mockMessages });

      const result = await conversationsService.getMessages('conv-1');

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/broker/messages?conversation_id=conv-1');
      expect(result).toEqual(mockMessages);
    });

    it('should handle empty message list', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({ items: [] });

      const result = await conversationsService.getMessages('conv-1');

      expect(result).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Network error'));

      const result = await conversationsService.getMessages('conv-1');

      expect(result).toEqual([]);
    });
  });

  describe('sendMessage', () => {
    it('should submit chat query with correct params', async () => {
      const { chatService } = await import('@/lib/services/chat');

      await conversationsService.sendMessage({
        conversationId: 'conv-1',
        message: 'Hello',
        sessionId: 'session-1',
        agentName: 'test-agent',
        participantType: 'agent',
      });

      expect(chatService.submitChatQuery).toHaveBeenCalledWith(
        'Hello',
        'agent',
        'test-agent',
        'session-1',
        'conv-1'
      );
    });

    it('should strip namespace from agent name', async () => {
      const { chatService } = await import('@/lib/services/chat');

      await conversationsService.sendMessage({
        conversationId: 'conv-1',
        message: 'Hello',
        sessionId: 'session-1',
        agentName: 'namespace/test-agent',
        participantType: 'agent',
      });

      expect(chatService.submitChatQuery).toHaveBeenCalledWith(
        'Hello',
        'agent',
        'test-agent',
        'session-1',
        'conv-1'
      );
    });

    it('should default to agent type when participantType not provided', async () => {
      const { chatService } = await import('@/lib/services/chat');

      await conversationsService.sendMessage({
        conversationId: 'conv-1',
        message: 'Hello',
        sessionId: 'session-1',
        agentName: 'test-agent',
      });

      expect(chatService.submitChatQuery).toHaveBeenCalledWith(
        'Hello',
        'agent',
        'test-agent',
        'session-1',
        'conv-1'
      );
    });
  });
});
