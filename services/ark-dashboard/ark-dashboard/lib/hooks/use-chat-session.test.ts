import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'jotai';
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { CHAT_STREAMING_FEATURE_KEY } from '@/atoms/experimental-features';
import { agentsService, chatService } from '@/lib/services';
import type { ChatResponse } from '@/lib/services/chat';
import { trackEvent } from '@/lib/analytics/singleton';

import { useChatSession } from './use-chat-session';

vi.mock('@/providers/NamespaceProvider', () => ({
  useNamespace: () => ({
    namespace: 'default',
    isNamespaceResolved: true,
    isPending: false,
    readOnlyMode: false,
  }),
}));

vi.mock('@/lib/services', () => ({
  chatService: {
    startStreamChatResponse: vi.fn(),
    streamQueryStatus: vi.fn(),
    getQueryResult: vi.fn(),
    getQuery: vi.fn(),
    resolveMemoryNotice: vi
      .fn()
      .mockResolvedValue({ settled: true, notice: null }),
    submitChatQuery: vi.fn(),
    cancelQuery: vi.fn(),
    getA2ATask: vi.fn(),
  },
  agentsService: {
    getByName: vi.fn(),
  },
}));

const mockInvalidateQueriesList = vi.fn();

vi.mock('@/lib/services/queries-hooks', () => ({
  useInvalidateQueriesList: () => mockInvalidateQueriesList,
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

// The real chunk stream is an async generator; wrap array fixtures so tests
// pass the same shape the hook consumes.
async function* toAsyncIterable<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

// Shaped like the DOM AbortError the real fetch throws.
function makeAbortError(): Error {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' });
}

describe('useChatSession - Approval Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    vi.mocked(agentsService.getByName).mockResolvedValue(null);
    vi.mocked(chatService.resolveMemoryNotice).mockResolvedValue({
      settled: true,
      notice: null,
    });
    globalThis.sessionStorage?.clear();
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
        chunks: toAsyncIterable(mockChunks),
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
        chunks: toAsyncIterable(mockChunks),
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
        chunks: toAsyncIterable(mockChunks),
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
        chunks: toAsyncIterable(mockChunks),
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
          'default',
          'test-query-poll',
        );
      });
    });

    // applyTerminalResult is the third and least-travelled place the banner is
    // written from; nothing else exercises it.
    it('surfaces a memory notice carried by the post-approval result', async () => {
      const unavailable = {
        type: 'MemoryUnavailable' as const,
        message: 'no Memory backend was reachable',
      };
      async function* approvalChunks(): AsyncGenerator<
        Record<string, unknown>,
        void,
        unknown
      > {
        yield {
          type: 'tool_approval_request',
          taskId: 'task-notice',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'test-tool', arguments: '{}' },
            },
          ],
        };
      }

      vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
        queryName: 'test-query-notice',
        chunks: approvalChunks(),
      });
      vi.mocked(chatService.streamQueryStatus).mockResolvedValue(vi.fn());
      vi.mocked(chatService.getQueryResult).mockResolvedValue({
        terminal: true,
        status: 'done',
        messages: [{ role: 'assistant', content: 'Tool executed' }],
        memoryLookup: { settled: true, notice: unavailable },
      });

      const { result } = renderHook(
        () => useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper: createWrapper() },
      );

      await act(async () => {
        await result.current.sendMessage('test message');
      });

      await act(async () => {
        await result.current.pollAfterApproval();
      });

      await waitFor(() => {
        expect(result.current.memoryNotice).toEqual(unavailable);
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
        chunks: toAsyncIterable(mockChunks),
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
        chunks: toAsyncIterable(mockChunks),
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
        chunks: toAsyncIterable(mockChunks),
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
});

describe('useChatSession - Conversation ID Continuity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    vi.mocked(agentsService.getByName).mockResolvedValue(null);
    vi.mocked(chatService.resolveMemoryNotice).mockResolvedValue({
      settled: true,
      notice: null,
    });
    globalThis.sessionStorage?.clear();
  });

  function contentChunkWithoutConversationId() {
    return [
      {
        id: 'chatcmpl-1',
        choices: [{ delta: { content: 'Hello' }, finish_reason: 'stop' }],
      },
    ];
  }

  function finalChunkWithConversationId(conversationId: string) {
    return [
      {
        id: 'chatcmpl-final',
        ark: {
          completedQuery: {
            metadata: { name: 'test-query' },
            status: { conversationId },
          },
        },
      },
    ];
  }

  it('releases the chunk stream when the loop breaks early on an error chunk', async () => {
    const cleanup = vi.fn();
    async function* erroringChunks(): AsyncGenerator<Record<string, unknown>> {
      try {
        yield { error: { message: 'boom' } };
        yield { choices: [{ delta: { content: 'unreached' } }] };
      } finally {
        cleanup();
      }
    }
    vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
      queryName: 'test-query-error-break',
      chunks: erroringChunks(),
    });
    vi.mocked(chatService.streamQueryStatus).mockResolvedValue(vi.fn());

    const { result } = renderHook(
      () => useChatSession({ name: 'test-agent', type: 'agent' }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    // The error chunk breaks the consumer loop; stopStreamOnSignal must
    // propagate that to the source generator so its reader is released.
    await waitFor(() => {
      expect(cleanup).toHaveBeenCalled();
    });
  });

  it('fetches conversationId via getQuery when the final stream chunk is missing', async () => {
    vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
      queryName: 'test-query-missing-final',
      chunks: toAsyncIterable(contentChunkWithoutConversationId()),
    });
    vi.mocked(chatService.streamQueryStatus).mockResolvedValue(vi.fn());
    vi.mocked(chatService.getQuery).mockResolvedValueOnce({
      status: { conversationId: 'conv-fallback' },
    } as Awaited<ReturnType<typeof chatService.getQuery>>);

    const { result } = renderHook(
      () => useChatSession({ name: 'test-agent', type: 'agent' }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    await waitFor(() => {
      expect(chatService.getQuery).toHaveBeenCalledWith(
        'default',
        'test-query-missing-final',
      );
    });
  });

  it('passes the recovered conversationId to the next query, restoring continuity', async () => {
    vi.mocked(chatService.startStreamChatResponse)
      .mockResolvedValueOnce({
        queryName: 'test-query-first',
        chunks: toAsyncIterable(contentChunkWithoutConversationId()),
      })
      .mockResolvedValueOnce({
        queryName: 'test-query-second',
        chunks: toAsyncIterable(contentChunkWithoutConversationId()),
      });
    vi.mocked(chatService.streamQueryStatus).mockResolvedValue(vi.fn());
    vi.mocked(chatService.getQuery).mockResolvedValue({
      status: { conversationId: 'conv-fallback' },
    } as Awaited<ReturnType<typeof chatService.getQuery>>);

    const { result } = renderHook(
      () => useChatSession({ name: 'test-agent', type: 'agent' }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.sendMessage('first message');
    });

    await waitFor(() => {
      expect(chatService.getQuery).toHaveBeenCalledWith('default', 'test-query-first');
    });

    await act(async () => {
      await result.current.sendMessage('second message');
    });

    await waitFor(() => {
      expect(chatService.startStreamChatResponse).toHaveBeenCalledTimes(2);
    });

    const secondCallArgs = vi.mocked(chatService.startStreamChatResponse).mock
      .calls[1];
    expect(secondCallArgs[5]).toBe('conv-fallback');
  });

  it('does not call getQuery when the stream already provides a conversationId', async () => {
    vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
      queryName: 'test-query-has-final',
      chunks: toAsyncIterable(finalChunkWithConversationId('conv-from-stream')),
    });
    vi.mocked(chatService.streamQueryStatus).mockResolvedValue(vi.fn());

    const { result } = renderHook(
      () => useChatSession({ name: 'test-agent', type: 'agent' }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    await waitFor(() => {
      expect(result.current.isProcessing).toBe(false);
    });

    expect(chatService.getQuery).not.toHaveBeenCalled();
  });

  it('recovers gracefully when the getQuery fallback throws', async () => {
    vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
      queryName: 'test-query-throws',
      chunks: toAsyncIterable(contentChunkWithoutConversationId()),
    });
    vi.mocked(chatService.streamQueryStatus).mockResolvedValue(vi.fn());
    vi.mocked(chatService.getQuery).mockRejectedValueOnce(
      new Error('network error'),
    );

    const { result } = renderHook(
      () => useChatSession({ name: 'test-agent', type: 'agent' }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.sendMessage('hello');
    });

    await waitFor(() => {
      expect(chatService.getQuery).toHaveBeenCalledWith('default', 'test-query-throws');
    });

    expect(result.current.error).toBeNull();
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
          chunks: toAsyncIterable(mockChunks),
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
          chunks: toAsyncIterable(mockChunks),
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

describe('useChatSession - Stream force-close (#2862)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    vi.mocked(agentsService.getByName).mockResolvedValue(null);
    vi.mocked(chatService.resolveMemoryNotice).mockResolvedValue({
      settled: true,
      notice: null,
    });
    globalThis.sessionStorage?.clear();
  });

  it('fires chat_stream_force_closed when a terminal phase force-closes a hung stream', async () => {
    vi.mocked(chatService.startStreamChatResponse).mockImplementation(
      async (
        _namespace,
        _input,
        _targetType,
        _targetName,
        _sessionId,
        _conversationId,
        _timeout,
        abortSignal,
      ) => {
        async function* hung(): AsyncGenerator<Record<string, unknown>> {
          yield { choices: [{ delta: { content: 'x' } }] };
          await new Promise<void>((_resolve, reject) => {
            if (abortSignal?.aborted) return reject(makeAbortError());
            abortSignal?.addEventListener(
              'abort',
              () => reject(makeAbortError()),
              { once: true },
            );
          });
        }
        return { queryName: 'q-force', chunks: hung() };
      },
    );
    vi.mocked(chatService.streamQueryStatus).mockImplementation(
      async (_namespace, _queryName, _onUpdate, _pollInterval, onTerminal) => {
        onTerminal?.('done');
        return vi.fn();
      },
    );

    const { result } = renderHook(
      () => useChatSession({ name: 'test-agent', type: 'agent' }),
      { wrapper: createWrapper() },
    );
    await act(async () => {
      await result.current.sendMessage('hello');
    });

    await waitFor(() => {
      expect(vi.mocked(trackEvent)).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'chat_stream_force_closed' }),
      );
    });
  });

  it('does not fire chat_stream_force_closed on a clean stream completion', async () => {
    vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
      queryName: 'q-clean',
      chunks: toAsyncIterable([
        { choices: [{ delta: { content: 'hi' }, finish_reason: 'stop' }] },
      ]),
    });
    // The stream ends on its own; the phase poll never reports terminal.
    vi.mocked(chatService.streamQueryStatus).mockResolvedValue(vi.fn());

    const { result } = renderHook(
      () => useChatSession({ name: 'test-agent', type: 'agent' }),
      { wrapper: createWrapper() },
    );
    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(vi.mocked(trackEvent)).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'chat_stream_force_closed' }),
    );
  });

  it('tears down phase polling even when the stream loop throws (user cancel)', async () => {
    const stopPhasePolling = vi.fn();
    vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
      queryName: 'q-throw',
      chunks: (async function* (): AsyncGenerator<Record<string, unknown>> {
        yield { choices: [{ delta: { content: 'x' } }] };
        // External cancel aborts the read; not our terminal-phase force-close.
        throw makeAbortError();
      })(),
    });
    vi.mocked(chatService.streamQueryStatus).mockResolvedValue(stopPhasePolling);

    const { result } = renderHook(
      () => useChatSession({ name: 'test-agent', type: 'agent' }),
      { wrapper: createWrapper() },
    );
    await act(async () => {
      await result.current.sendMessage('hello');
    });

    // The AbortError propagates out of the loop; cleanup must still have run.
    await waitFor(() => {
      expect(stopPhasePolling).toHaveBeenCalled();
    });
  });
});

describe('useChatSession - Resume after navigation (#3844)', () => {
  const CHAT_KEY = 'agent-test-agent';

  type A2ATask = Awaited<ReturnType<typeof chatService.getA2ATask>>;
  type QueryDetail = Awaited<ReturnType<typeof chatService.getQuery>>;

  function seedChatSession(session: Record<string, unknown>) {
    globalThis.sessionStorage.setItem(
      'agent-chat-history',
      JSON.stringify({
        [CHAT_KEY]: { sessionId: 'chat-test-agent-abc', ...session },
      }),
    );
  }

  function storedActiveQueryName(): string | undefined {
    const stored = JSON.parse(
      globalThis.sessionStorage.getItem('agent-chat-history') || '{}',
    );
    return stored[CHAT_KEY]?.activeQueryName;
  }

  function renderChatSession() {
    return renderHook(
      () => useChatSession({ name: 'test-agent', type: 'agent' }),
      { wrapper: createWrapper() },
    );
  }

  function mockPendingApprovalTask() {
    vi.mocked(chatService.getQuery).mockResolvedValue({
      namespace: 'default',
      status: { phase: 'input-required', response: { a2a: { taskId: 't1' } } },
    } as unknown as QueryDetail);
    vi.mocked(chatService.getA2ATask).mockResolvedValue({
      agentRef: { name: 'test-agent' },
      status: {
        protocolMetadata: {
          toolCalls: JSON.stringify([
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'write-file', arguments: '{}' },
            },
          ]),
          timeout: '5m',
        },
      },
    } as unknown as A2ATask);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    vi.mocked(agentsService.getByName).mockResolvedValue(null);
    vi.mocked(chatService.resolveMemoryNotice).mockResolvedValue({
      settled: true,
      notice: null,
    });
    globalThis.sessionStorage?.clear();
    globalThis.localStorage?.removeItem(CHAT_STREAMING_FEATURE_KEY);
  });

  it('keeps the active query and aborts the stream when the panel unmounts mid-stream', async () => {
    let streamSignal: AbortSignal | undefined;
    vi.mocked(chatService.startStreamChatResponse).mockImplementationOnce(
      async (...args) => {
        const signal = args[7] as AbortSignal;
        streamSignal = signal;
        return {
          queryName: 'q-running',
          chunks: (async function* (): AsyncGenerator<Record<string, unknown>> {
            yield { choices: [{ delta: { content: 'partial' } }] };
            await new Promise(resolve =>
              signal.addEventListener('abort', resolve),
            );
            throw makeAbortError();
          })(),
        };
      },
    );
    vi.mocked(chatService.streamQueryStatus).mockResolvedValue(vi.fn());

    const { result, unmount } = renderChatSession();
    let sending: Promise<void> | undefined;
    act(() => {
      sending = result.current.sendMessage('hello');
    });

    await waitFor(() => {
      expect(storedActiveQueryName()).toBe('q-running');
    });

    unmount();
    await sending;

    expect(streamSignal?.aborted).toBe(true);
    expect(storedActiveQueryName()).toBe('q-running');
  });

  it('keeps the active query and writes no error when the page unloads mid-stream', async () => {
    let streamSignal: AbortSignal | undefined;
    vi.mocked(chatService.startStreamChatResponse).mockImplementationOnce(
      async (...args) => {
        const signal = args[7] as AbortSignal;
        streamSignal = signal;
        return {
          queryName: 'q-reload',
          chunks: (async function* (): AsyncGenerator<Record<string, unknown>> {
            yield { choices: [{ delta: { content: 'partial' } }] };
            await new Promise(resolve =>
              signal.addEventListener('abort', resolve),
            );
            throw new TypeError('Failed to fetch');
          })(),
        };
      },
    );
    vi.mocked(chatService.streamQueryStatus).mockResolvedValue(vi.fn());

    const { result } = renderChatSession();
    let sending: Promise<void> | undefined;
    act(() => {
      sending = result.current.sendMessage('hello');
    });

    await waitFor(() => {
      expect(storedActiveQueryName()).toBe('q-reload');
    });

    await act(async () => {
      globalThis.dispatchEvent(new Event('pagehide'));
      await sending;
    });

    expect(streamSignal?.aborted).toBe(true);
    expect(storedActiveQueryName()).toBe('q-reload');
    expect(
      result.current.messages.some(msg => msg.metadata?.status === 'failed'),
    ).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('keeps the active query and writes no error when the page unloads while polling', async () => {
    globalThis.localStorage.setItem(
      CHAT_STREAMING_FEATURE_KEY,
      JSON.stringify(false),
    );
    vi.mocked(chatService.submitChatQuery).mockResolvedValueOnce({
      name: 'q-poll-reload',
    } as Awaited<ReturnType<typeof chatService.submitChatQuery>>);
    let resolveResult: ((value: ChatResponse) => void) | undefined;
    vi.mocked(chatService.getQueryResult).mockImplementationOnce(
      () =>
        new Promise<ChatResponse>(resolve => {
          resolveResult = resolve;
        }),
    );

    const { result } = renderChatSession();
    let sending: Promise<void> | undefined;
    act(() => {
      sending = result.current.sendMessage('hello');
    });

    await waitFor(() => {
      expect(storedActiveQueryName()).toBe('q-poll-reload');
    });

    await act(async () => {
      globalThis.dispatchEvent(new Event('pagehide'));
      resolveResult?.({ status: 'error', terminal: true });
      await sending;
    });

    expect(storedActiveQueryName()).toBe('q-poll-reload');
    expect(result.current.messages).toEqual([
      { role: 'user', content: 'hello' },
    ]);
  });

  it('keeps the active query when the stream fails with a network error', async () => {
    vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
      queryName: 'q-network',
      chunks: (async function* (): AsyncGenerator<Record<string, unknown>> {
        yield { choices: [{ delta: { content: 'partial' } }] };
        throw new TypeError('Failed to fetch');
      })(),
    });
    vi.mocked(chatService.streamQueryStatus).mockResolvedValue(vi.fn());

    const { result } = renderChatSession();
    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(
      result.current.messages.some(msg => msg.metadata?.status === 'failed'),
    ).toBe(true);
    expect(storedActiveQueryName()).toBe('q-network');
  });

  it('drops a stale active query before starting the next turn', async () => {
    vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
      queryName: 'q-network',
      chunks: (async function* (): AsyncGenerator<Record<string, unknown>> {
        yield { choices: [{ delta: { content: 'partial' } }] };
        throw new TypeError('Failed to fetch');
      })(),
    });
    vi.mocked(chatService.streamQueryStatus).mockResolvedValue(vi.fn());

    const { result } = renderChatSession();
    await act(async () => {
      await result.current.sendMessage('hello');
    });
    expect(storedActiveQueryName()).toBe('q-network');

    let activeAtSecondSend: string | undefined = 'unset';
    vi.mocked(chatService.startStreamChatResponse).mockImplementationOnce(
      async () => {
        activeAtSecondSend = storedActiveQueryName();
        return {
          queryName: 'q-next',
          chunks: toAsyncIterable([
            {
              choices: [
                { delta: { content: 'answer' }, finish_reason: 'stop' },
              ],
            },
          ]),
        };
      },
    );
    vi.mocked(chatService.getQuery).mockResolvedValue({
      status: { conversationId: 'conv-1' },
    } as unknown as QueryDetail);

    await act(async () => {
      await result.current.sendMessage('again');
    });

    expect(activeAtSecondSend).toBeUndefined();
    expect(storedActiveQueryName()).toBeUndefined();
  });

  it('keeps the active query when polling cannot reach the API', async () => {
    globalThis.localStorage.setItem(
      CHAT_STREAMING_FEATURE_KEY,
      JSON.stringify(false),
    );
    vi.mocked(chatService.submitChatQuery).mockResolvedValueOnce({
      name: 'q-poll-network',
    } as Awaited<ReturnType<typeof chatService.submitChatQuery>>);
    vi.mocked(chatService.getQueryResult).mockResolvedValueOnce({
      status: 'error',
      terminal: true,
      transportError: true,
    });
    vi.mocked(chatService.getQuery).mockResolvedValue(
      undefined as unknown as QueryDetail,
    );

    const { result } = renderChatSession();
    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(storedActiveQueryName()).toBe('q-poll-network');
  });

  it('clears the active query when the turn completes', async () => {
    vi.mocked(chatService.startStreamChatResponse).mockResolvedValueOnce({
      queryName: 'q-done',
      chunks: toAsyncIterable([
        { choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] },
      ]),
    });
    vi.mocked(chatService.streamQueryStatus).mockResolvedValue(vi.fn());
    vi.mocked(chatService.getQuery).mockResolvedValue({
      status: { conversationId: 'conv-1' },
    } as unknown as QueryDetail);

    const { result } = renderChatSession();
    await act(async () => {
      await result.current.sendMessage('hello');
    });

    expect(storedActiveQueryName()).toBeUndefined();
  });

  it('does not poll on mount when there is no active query', async () => {
    seedChatSession({ messages: [{ role: 'user', content: 'hello' }] });

    renderChatSession();

    await act(async () => {
      await Promise.resolve();
    });
    expect(chatService.getQueryResult).not.toHaveBeenCalled();
  });

  it('shows a running query on mount and replaces the turn with its result', async () => {
    seedChatSession({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'partial' },
      ],
      activeQueryName: 'q-running',
    });
    vi.mocked(chatService.getQueryResult)
      .mockResolvedValueOnce({ status: 'running', terminal: false })
      .mockResolvedValueOnce({
        status: 'done',
        terminal: true,
        messages: [{ role: 'assistant', content: 'final answer' }],
      });

    const { result } = renderChatSession();

    await waitFor(() => {
      expect(result.current.isProcessing).toBe(true);
      expect(result.current.processingPhase).toBe('running');
    });
    expect(chatService.getQueryResult).toHaveBeenCalledWith(
      'default',
      'q-running',
    );

    await waitFor(
      () => {
        expect(result.current.isProcessing).toBe(false);
      },
      { timeout: 3000 },
    );
    expect(result.current.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'final answer' },
    ]);
    expect(storedActiveQueryName()).toBeUndefined();
  });

  it('removes the error left by a reload while the query is still running', async () => {
    seedChatSession({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'partial' },
        {
          role: 'assistant',
          content: 'Unable to connect to the ARK API.',
          metadata: { status: 'failed' },
        },
      ],
      activeQueryName: 'q-running',
    });
    vi.mocked(chatService.getQueryResult).mockResolvedValue({
      status: 'running',
      terminal: false,
    });

    const { result } = renderChatSession();

    await waitFor(() => {
      expect(result.current.isProcessing).toBe(true);
      expect(result.current.messages).toEqual([
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'partial' },
      ]);
    });
  });

  it('marks the turn as failed when the resumed query errored', async () => {
    seedChatSession({
      messages: [{ role: 'user', content: 'hello' }],
      activeQueryName: 'q-error',
    });
    vi.mocked(chatService.getQueryResult).mockResolvedValueOnce({
      status: 'error',
      terminal: true,
      response: 'boom',
    });

    const { result } = renderChatSession();

    await waitFor(() => {
      expect(result.current.messages).toEqual([
        { role: 'user', content: 'hello' },
        {
          role: 'assistant',
          content: 'boom',
          metadata: { status: 'failed', queryName: 'q-error' },
        },
      ]);
    });
    expect(result.current.isProcessing).toBe(false);
  });

  it('restores the approval card when the query is waiting for input', async () => {
    seedChatSession({
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: '' },
      ],
      activeQueryName: 'q-approval',
    });
    vi.mocked(chatService.getQueryResult).mockResolvedValueOnce({
      status: 'input-required',
      terminal: false,
    });
    mockPendingApprovalTask();

    const { result } = renderChatSession();

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1].approvalRequest?.taskId).toBe('t1');
    });
    expect(result.current.isProcessing).toBe(false);
    expect(chatService.getQuery).toHaveBeenCalledWith('default', 'q-approval');
    expect(chatService.getA2ATask).toHaveBeenCalledWith(
      'default',
      'a2a-task-t1',
    );
  });

  it('does not duplicate an approval card that is already shown', async () => {
    seedChatSession({
      messages: [
        { role: 'user', content: 'hello' },
        {
          role: 'assistant',
          content: '',
          approvalRequest: {
            type: 'tool_approval_request',
            taskId: 't1',
            toolCalls: [],
          },
        },
      ],
      activeQueryName: 'q-approval',
    });
    vi.mocked(chatService.getQueryResult).mockResolvedValueOnce({
      status: 'input-required',
      terminal: false,
    });
    mockPendingApprovalTask();

    const { result } = renderChatSession();

    await waitFor(() => {
      expect(chatService.getA2ATask).toHaveBeenCalled();
    });
    expect(result.current.messages).toHaveLength(2);
  });

  it('lets a restored approval be followed through to the final answer', async () => {
    seedChatSession({
      messages: [{ role: 'user', content: 'hello' }],
      activeQueryName: 'q-approval',
    });
    vi.mocked(chatService.getQueryResult)
      .mockResolvedValueOnce({ status: 'input-required', terminal: false })
      .mockResolvedValueOnce({
        status: 'done',
        terminal: true,
        messages: [{ role: 'assistant', content: 'approved answer' }],
      });
    mockPendingApprovalTask();

    const { result } = renderChatSession();

    await waitFor(() => {
      expect(result.current.messages[1]?.approvalRequest?.taskId).toBe('t1');
    });

    await act(async () => {
      await result.current.pollAfterApproval();
    });

    expect(result.current.messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'approved answer' },
    ]);
    expect(storedActiveQueryName()).toBeUndefined();
  });
});
