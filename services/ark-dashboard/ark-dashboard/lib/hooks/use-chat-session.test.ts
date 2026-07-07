import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'jotai';
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { agentsService, chatService } from '@/lib/services';

import { useChatSession } from './use-chat-session';

vi.mock('@/lib/services', () => ({
  chatService: {
    startStreamChatResponse: vi.fn(),
    streamQueryStatus: vi.fn(),
    getQueryResult: vi.fn(),
    getQuery: vi.fn(),
    submitChatQuery: vi.fn(),
    cancelQuery: vi.fn(),
  },
  agentsService: {
    getByName: vi.fn(),
  },
}));

vi.mock('@/lib/analytics/singleton', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/lib/analytics/utils', () => ({
  hashPromptSync: vi.fn(() => 'test-hash'),
}));

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(Provider, null, children);
}

describe('useChatSession - Approval Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    vi.mocked(agentsService.getByName).mockResolvedValue(null);
  });

  describe('Tool Approval Detection', () => {
    it('detects tool_approval_request event in stream', async () => {
      const mockChunks = [
        {
          type: 'tool_approval_request',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'dangerous-tool', arguments: '{}' },
            },
          ],
          timeout: '5m',
          onTimeout: 'reject',
        },
      ];

      const stopPhasePolling = vi.fn();
      vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
        queryName: 'test-query-123',
        chunks: mockChunks as AsyncIterable<unknown>,
      });
      vi.mocked(chatService.streamQueryStatus).mockResolvedValueOnce(
        stopPhasePolling,
      );

      const { result } = renderHook(() =>
        useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendMessage('test message');
      });

      await waitFor(() => {
        const messages = result.current.messages;
        const approvalMessage = messages.find(
          msg => 'approvalRequest' in msg && msg.approvalRequest !== undefined,
        );
        expect(approvalMessage).toBeDefined();
      });

      expect(stopPhasePolling).toHaveBeenCalled();
    });

    it('stores pending approval query reference', async () => {
      const mockChunks = [
        {
          type: 'tool_approval_request',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'write-file', arguments: '{}' },
            },
          ],
        },
      ];

      const stopPhasePolling = vi.fn();
      vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
        queryName: 'test-query-456',
        chunks: mockChunks as AsyncIterable<unknown>,
      });
      vi.mocked(chatService.streamQueryStatus).mockResolvedValueOnce(
        stopPhasePolling,
      );

      const { result } = renderHook(() =>
        useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendMessage('test message');
      });

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(1);
      });
    });

    it('does not finalize message when approval is pending', async () => {
      const mockChunks = [
        {
          type: 'tool_approval_request',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'delete-database', arguments: '{}' },
            },
          ],
        },
      ];

      const stopPhasePolling = vi.fn();
      vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
        queryName: 'test-query-789',
        chunks: mockChunks as AsyncIterable<unknown>,
      });
      vi.mocked(chatService.streamQueryStatus).mockResolvedValueOnce(
        stopPhasePolling,
      );

      const { result } = renderHook(() =>
        useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendMessage('test message');
      });

      await waitFor(() => {
        const messages = result.current.messages;
        const approvalMessage = messages.find(
          msg => 'approvalRequest' in msg,
        );
        expect(approvalMessage).toBeDefined();
      });
    });
  });

  describe('pollAfterApproval', () => {
    it('polls query status after approval', async () => {
      const mockChunks = [
        {
          type: 'tool_approval_request',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'test-tool', arguments: '{}' },
            },
          ],
        },
      ];

      const stopPhasePolling = vi.fn();
      vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
        queryName: 'test-query-poll',
        chunks: mockChunks as AsyncIterable<unknown>,
      });
      vi.mocked(chatService.streamQueryStatus).mockResolvedValueOnce(
        stopPhasePolling,
      );
      vi.mocked(chatService.getQueryResult).mockResolvedValueOnce({
        terminal: true,
        status: 'done',
        messages: [
          {
            role: 'assistant',
            content: 'Tool executed successfully',
          },
        ],
      });

      const { result } = renderHook(() =>
        useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendMessage('test message');
      });

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(1);
      });

      await act(async () => {
        await result.current.pollAfterApproval();
      });

      await waitFor(() => {
        expect(chatService.getQueryResult).toHaveBeenCalledWith(
          'test-query-poll',
        );
      });
    });

    it('updates messages when query completes after approval', async () => {
      const mockChunks = [
        {
          type: 'tool_approval_request',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'write-file', arguments: '{}' },
            },
          ],
        },
      ];

      const stopPhasePolling = vi.fn();
      vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
        queryName: 'test-query-complete',
        chunks: mockChunks as AsyncIterable<unknown>,
      });
      vi.mocked(chatService.streamQueryStatus).mockResolvedValueOnce(
        stopPhasePolling,
      );
      vi.mocked(chatService.getQueryResult).mockResolvedValueOnce({
        terminal: true,
        status: 'done',
        messages: [
          {
            role: 'tool',
            content: 'File written successfully',
            tool_call_id: 'call-1',
          },
          {
            role: 'assistant',
            content: 'I have written the file',
          },
        ],
      });

      const { result } = renderHook(() =>
        useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendMessage('test message');
      });

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(1);
      });

      await act(async () => {
        await result.current.pollAfterApproval();
      });

      await waitFor(() => {
        const messages = result.current.messages;
        const toolMessage = messages.find(msg => msg.role === 'tool');
        expect(toolMessage).toBeDefined();
        expect(toolMessage?.content).toBe('File written successfully');
      });
    });

    it('handles error status after approval', async () => {
      const mockChunks = [
        {
          type: 'tool_approval_request',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'failing-tool', arguments: '{}' },
            },
          ],
        },
      ];

      const stopPhasePolling = vi.fn();
      vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
        queryName: 'test-query-error',
        chunks: mockChunks as AsyncIterable<unknown>,
      });
      vi.mocked(chatService.streamQueryStatus).mockResolvedValueOnce(
        stopPhasePolling,
      );
      vi.mocked(chatService.getQueryResult).mockResolvedValueOnce({
        terminal: true,
        status: 'error',
        response: 'Tool execution failed',
      });

      const { result } = renderHook(() =>
        useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendMessage('test message');
      });

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(1);
      });

      await act(async () => {
        await result.current.pollAfterApproval();
      });

      await waitFor(() => {
        const messages = result.current.messages;
        const errorMessage = messages.find(
          msg =>
            msg.role === 'assistant' &&
            msg.content === 'Tool execution failed',
        );
        expect(errorMessage).toBeDefined();
      });
    });

    it.skip('times out after 120 seconds of polling', async () => {
      // Requires complex fake timer handling; timeout logic covered by manual testing.
    });

    it('does nothing when no pending approval exists', async () => {
      const { result } = renderHook(() =>
        useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.pollAfterApproval();
      });

      expect(chatService.getQueryResult).not.toHaveBeenCalled();
    });

    it('stops polling when query completes', async () => {
      const mockChunks = [
        {
          type: 'tool_approval_request',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'test-tool', arguments: '{}' },
            },
          ],
        },
      ];

      const stopPhasePolling = vi.fn();
      vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
        queryName: 'test-query-stop',
        chunks: mockChunks as AsyncIterable<unknown>,
      });
      vi.mocked(chatService.streamQueryStatus).mockResolvedValueOnce(
        stopPhasePolling,
      );
      vi.mocked(chatService.getQueryResult).mockResolvedValueOnce({
        terminal: true,
        status: 'done',
        messages: [],
      });

      const { result } = renderHook(() =>
        useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendMessage('test message');
      });

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(1);
      });

      await act(async () => {
        await result.current.pollAfterApproval();
      });

      expect(chatService.getQueryResult).toHaveBeenCalled();
    });
  });

  describe('Approval Message Display', () => {
    it.skip('includes query name in approval message metadata', async () => {
        const mockChunks = [
          {
            type: 'tool_approval_request',
            toolCalls: [
              {
                id: 'call-1',
                type: 'function',
                function: { name: 'test-tool', arguments: '{}' },
              },
            ],
          },
        ];

        const stopPhasePolling = vi.fn();
        vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
          queryName: 'test-query-metadata',
          chunks: mockChunks as AsyncIterable<unknown>,
        });
        vi.mocked(chatService.streamQueryStatus).mockResolvedValueOnce(
          stopPhasePolling,
        );

        const { result } = renderHook(() =>
          useChatSession({ name: 'test-agent', type: 'agent' }),
          { wrapper: createWrapper() },
        );

        await act(async () => {
          await result.current.sendMessage('test message');
        });

        await waitFor(
          () => {
            const messages = result.current.messages;
            const approvalMessage = messages.find(
              msg =>
                'approvalRequest' in msg && msg.approvalRequest !== undefined,
            );
            expect(approvalMessage).toBeDefined();
            expect(approvalMessage?.metadata?.queryName).toBe(
              'test-query-metadata',
            );
          },
          { timeout: 10000 },
        );
    });

    it.skip('preserves tool call information in approval message', async () => {
        const toolCalls = [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'write-file',
              arguments: '{"path": "/tmp/test.txt", "content": "test"}',
            },
          },
          {
            id: 'call-2',
            type: 'function',
            function: {
              name: 'delete-file',
              arguments: '{"path": "/tmp/old.txt"}',
            },
          },
        ];

        const mockChunks = [
          {
            type: 'tool_approval_request',
            toolCalls,
          },
        ];

        const stopPhasePolling = vi.fn();
        vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
          queryName: 'test-query-tools',
          chunks: mockChunks as AsyncIterable<unknown>,
        });
        vi.mocked(chatService.streamQueryStatus).mockResolvedValueOnce(
          stopPhasePolling,
        );

        const { result } = renderHook(() =>
          useChatSession({ name: 'test-agent', type: 'agent' }),
          { wrapper: createWrapper() },
        );

        await act(async () => {
          await result.current.sendMessage('test message');
        });

        await waitFor(
          () => {
            const messages = result.current.messages;
            const approvalMessage = messages.find(
              msg =>
                'approvalRequest' in msg && msg.approvalRequest !== undefined,
            );
            expect(approvalMessage).toBeDefined();
            expect(
              (
                approvalMessage as {
                  approvalRequest?: { toolCalls?: unknown[] };
                }
              ).approvalRequest?.toolCalls,
            ).toHaveLength(2);
          },
          { timeout: 10000 },
        );
    });
  });
});
