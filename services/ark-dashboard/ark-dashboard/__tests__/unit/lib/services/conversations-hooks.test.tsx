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

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'default',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

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

      vi.mocked(conversationsService.getMessages).mockResolvedValue({ messages: mockMessages });

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
      vi.mocked(conversationsService.getMessages).mockResolvedValue({ messages: [] });

      const { result } = renderHook(() => useGetMessages('session-1', null), {
        wrapper: createWrapper(),
      });

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

      vi.mocked(conversationsService.getMessages).mockResolvedValue({ messages: initialMessages });

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
});
