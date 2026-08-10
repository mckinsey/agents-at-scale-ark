import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { conversationsService } from '@/lib/services/conversations';
import {
  useListConversations,
  useGetMessages,
  useSendMessage,
} from '@/lib/services/conversations-hooks';
import type { Conversation, ConversationMessage } from '@/lib/services/conversations';

vi.mock('@/lib/services/conversations', () => ({
  conversationsService: {
    getConversations: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchInterval: false,
      },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('conversations hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useListConversations', () => {
    it('should fetch conversations for a session', async () => {
      const mockConversations: Conversation[] = [
        {
          conversationId: 'conv-1',
          name: 'test-agent',
          participants: ['test-agent'],
          messageCount: 5,
          toolCallCount: 2,
          duration: '2m 30s',
          status: 'completed',
          startTime: '2024-01-01T00:00:00Z',
          participantType: 'agent',
          errorCount: 0,
        },
      ];

      vi.mocked(conversationsService.getConversations).mockResolvedValue(mockConversations);

      const { result } = renderHook(() => useListConversations('session-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockConversations);
      expect(conversationsService.getConversations).toHaveBeenCalledWith('session-1');
    });

    it('should not fetch when sessionId is null', async () => {
      vi.mocked(conversationsService.getConversations).mockResolvedValue([]);

      const { result } = renderHook(() => useListConversations(null), {
        wrapper: createWrapper(),
      });

      expect(result.current.isFetching).toBe(false);
      expect(conversationsService.getConversations).not.toHaveBeenCalled();
    });

    it('should respect enabled option', async () => {
      vi.mocked(conversationsService.getConversations).mockResolvedValue([]);

      const { result } = renderHook(
        () => useListConversations('session-1', { enabled: false }),
        {
          wrapper: createWrapper(),
        }
      );

      expect(result.current.isFetching).toBe(false);
      expect(conversationsService.getConversations).not.toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      const error = new Error('Failed to fetch conversations');
      vi.mocked(conversationsService.getConversations).mockRejectedValue(error);

      const { result } = renderHook(() => useListConversations('session-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(error);
    });

    it('should keep placeholder data on refetch', async () => {
      const initialData: Conversation[] = [
        {
          conversationId: 'conv-1',
          name: 'test-agent',
          participants: ['test-agent'],
          messageCount: 5,
          toolCallCount: 2,
          duration: '2m 30s',
          status: 'completed',
          startTime: '2024-01-01T00:00:00Z',
          participantType: 'agent',
          errorCount: 0,
        },
      ];

      vi.mocked(conversationsService.getConversations).mockResolvedValue(initialData);

      const { result, rerender } = renderHook(
        () => useListConversations('session-1'),
        {
          wrapper: createWrapper(),
        }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(initialData);

      rerender();

      expect(result.current.data).toEqual(initialData);
    });
  });

  describe('useGetMessages', () => {
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

      vi.mocked(conversationsService.getMessages).mockResolvedValue(mockMessages);

      const { result } = renderHook(
        () => useGetMessages('session-1', 'conv-1'),
        {
          wrapper: createWrapper(),
        }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockMessages);
      expect(conversationsService.getMessages).toHaveBeenCalledWith('conv-1');
    });

    it('should not fetch when conversationId is null', async () => {
      vi.mocked(conversationsService.getMessages).mockResolvedValue([]);

      const { result } = renderHook(() => useGetMessages('session-1', null), {
        wrapper: createWrapper(),
      });

      expect(result.current.isFetching).toBe(false);
      expect(conversationsService.getMessages).not.toHaveBeenCalled();
    });

    it('should respect enabled option', async () => {
      vi.mocked(conversationsService.getMessages).mockResolvedValue([]);

      const { result } = renderHook(
        () => useGetMessages('session-1', 'conv-1', { enabled: false }),
        {
          wrapper: createWrapper(),
        }
      );

      expect(result.current.isFetching).toBe(false);
      expect(conversationsService.getMessages).not.toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      const error = new Error('Failed to fetch messages');
      vi.mocked(conversationsService.getMessages).mockRejectedValue(error);

      const { result } = renderHook(() => useGetMessages('session-1', 'conv-1'), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(error);
    });

    it('should keep placeholder data on refetch', async () => {
      const initialMessages: ConversationMessage[] = [
        {
          timestamp: '2024-01-01T00:00:00Z',
          conversation_id: 'conv-1',
          query_id: 'query-1',
          message: { role: 'user', content: 'Hello' },
          sequence: 1,
        },
      ];

      vi.mocked(conversationsService.getMessages).mockResolvedValue(initialMessages);

      const { result, rerender } = renderHook(
        () => useGetMessages('session-1', 'conv-1'),
        {
          wrapper: createWrapper(),
        }
      );

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(initialMessages);

      rerender();

      expect(result.current.data).toEqual(initialMessages);
    });
  });

  describe('useSendMessage', () => {
    it('should send a message and invalidate queries', async () => {
      vi.mocked(conversationsService.sendMessage).mockResolvedValue(undefined);

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
          },
        },
      });

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useSendMessage(), { wrapper });

      await act(async () => {
        result.current.mutate({
          conversationId: 'conv-1',
          message: 'Hello',
          sessionId: 'session-1',
          agentName: 'test-agent',
          participantType: 'agent',
        });
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(conversationsService.sendMessage).toHaveBeenCalled();
      const [[firstArg]] = vi.mocked(conversationsService.sendMessage).mock.calls;
      expect(firstArg).toEqual({
        conversationId: 'conv-1',
        message: 'Hello',
        sessionId: 'session-1',
        agentName: 'test-agent',
        participantType: 'agent',
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['messages', 'session-1', 'conv-1'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['conversations', 'session-1'],
      });
    });

    it('should handle errors', async () => {
      const error = new Error('Failed to send message');
      vi.mocked(conversationsService.sendMessage).mockRejectedValue(error);

      const { result } = renderHook(() => useSendMessage(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.mutate({
          conversationId: 'conv-1',
          message: 'Hello',
          sessionId: 'session-1',
          agentName: 'test-agent',
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error).toBe(error);
    });

    it('should use mutation function correctly', async () => {
      vi.mocked(conversationsService.sendMessage).mockResolvedValue(undefined);

      const { result } = renderHook(() => useSendMessage(), {
        wrapper: createWrapper(),
      });

      const params = {
        conversationId: 'conv-1',
        message: 'Test message',
        sessionId: 'session-1',
        agentName: 'test-agent',
        participantType: 'team' as const,
      };

      await act(async () => {
        result.current.mutate(params);
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(conversationsService.sendMessage).toHaveBeenCalled();
      const [[firstArg]] = vi.mocked(conversationsService.sendMessage).mock.calls;
      expect(firstArg).toEqual(params);
    });
  });
});
