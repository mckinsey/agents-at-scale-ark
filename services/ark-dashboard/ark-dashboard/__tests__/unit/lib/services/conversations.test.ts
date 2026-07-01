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
    it('should fetch conversations from backend', async () => {
      const mockSession = {
        sessionId: 'session-1',
        conversations: [
          {
            conversationId: 'conv-1',
            name: 'test-agent',
            participants: ['test-agent'],
            messageCount: 1,
            duration: '30s',
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
        queries: {
          'query-1': {
            name: 'query-1',
            conversationId: 'conv-1',
          },
          'query-2': {
            name: 'query-2',
            conversationId: 'conv-2',
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

    it('should return conversations with message counts from backend', async () => {
      const mockSession = {
        sessionId: 'session-1',
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
        queries: {
          'query-1': {
            name: 'query-1',
            conversationId: 'conv-1',
          },
          'query-2': {
            name: 'query-2',
            conversationId: 'conv-1',
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

    it('should determine participant type from backend', async () => {
      const mockSession = {
        sessionId: 'session-1',
        conversations: [
          {
            conversationId: 'conv-1',
            name: 'test-team',
            participants: ['test-team'],
            messageCount: 1,
            duration: '30s',
            startTime: '2024-01-01T00:00:00Z',
            participantType: 'team',
            errorCount: 0,
          },
        ],
        queries: {
          'query-1': {
            name: 'query-1',
            conversationId: 'conv-1',
          },
        },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

      const { logsService } = await import('@/lib/services/logs');
      vi.mocked(logsService.getEvents).mockResolvedValueOnce({ items: [] } as any);

      const result = await conversationsService.getConversations('session-1');

      expect(result[0].participantType).toBe('team');
    });

    it('should count tool calls from events', async () => {
      const mockSession = {
        sessionId: 'session-1',
        conversations: [
          {
            conversationId: 'conv-1',
            name: 'test-agent',
            participants: ['test-agent'],
            messageCount: 1,
            duration: '30s',
            startTime: '2024-01-01T00:00:00Z',
            participantType: 'agent',
            errorCount: 0,
          },
        ],
        queries: {
          'query-1': {
            name: 'query-1',
            conversationId: 'conv-1',
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

    it('should handle duration from backend', async () => {
      const mockSession = {
        sessionId: 'session-1',
        conversations: [
          {
            conversationId: 'conv-1',
            name: 'test-agent',
            participants: ['test-agent'],
            messageCount: 1,
            duration: '1m 30s',
            startTime: '2024-01-01T00:00:00Z',
            participantType: 'agent',
            errorCount: 0,
          },
        ],
        queries: {
          'query-1': {
            name: 'query-1',
            conversationId: 'conv-1',
          },
        },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

      const { logsService } = await import('@/lib/services/logs');
      vi.mocked(logsService.getEvents).mockResolvedValueOnce({ items: [] } as any);

      const result = await conversationsService.getConversations('session-1');

      expect(result[0].duration).toBe('1m 30s');
    });

    it('should handle ongoing duration from backend', async () => {
      const mockSession = {
        sessionId: 'session-1',
        conversations: [
          {
            conversationId: 'conv-1',
            name: 'test-agent',
            participants: ['test-agent'],
            messageCount: 1,
            duration: 'ongoing',
            startTime: '2024-01-01T00:00:00Z',
            participantType: 'agent',
            errorCount: 0,
          },
        ],
        queries: {
          'query-1': {
            name: 'query-1',
            conversationId: 'conv-1',
          },
        },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

      const { logsService } = await import('@/lib/services/logs');
      vi.mocked(logsService.getEvents).mockResolvedValueOnce({ items: [] } as any);

      const result = await conversationsService.getConversations('session-1');

      expect(result[0].duration).toBe('ongoing');
    });

    it('should handle error count from backend', async () => {
      const mockSession = {
        sessionId: 'session-1',
        conversations: [
          {
            conversationId: 'conv-1',
            name: 'test-agent',
            participants: ['test-agent'],
            messageCount: 2,
            duration: '1m',
            startTime: '2024-01-01T00:00:00Z',
            participantType: 'agent',
            errorCount: 2,
          },
        ],
        queries: {
          'query-1': {
            name: 'query-1',
            conversationId: 'conv-1',
          },
          'query-2': {
            name: 'query-2',
            conversationId: 'conv-1',
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

    it('should propagate errors', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Network error'));

      await expect(conversationsService.getConversations('session-1')).rejects.toThrow('Network error');
    });

    it('should handle empty conversations array from backend', async () => {
      const mockSession = {
        sessionId: 'session-1',
        conversations: [],
        queries: {},
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSession);

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

    it('should propagate errors', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Network error'));

      await expect(conversationsService.getMessages('conv-1')).rejects.toThrow('Network error');
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
        'conv-1',
        undefined,
        undefined,
        undefined
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
        'conv-1',
        undefined,
        undefined,
        undefined
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
        'conv-1',
        undefined,
        undefined,
        undefined
      );
    });
  });
});
