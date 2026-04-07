import { Provider, createStore } from 'jotai';
import type { ReactNode } from 'react';
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ChatSession,
  type TokenUsage,
  chatHistoryAtom,
} from '@/atoms/chat-history';
import { storedIsChatStreamingEnabledAtom } from '@/atoms/experimental-features';
import { lastConversationIdAtom } from '@/atoms/internal-states';
import { useChatSession } from '@/lib/hooks/use-chat-session';

vi.mock('@/lib/analytics/singleton', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/lib/analytics/utils', () => ({
  hashPromptSync: vi.fn(() => 'mockhash'),
}));

const mockStreamChatResponse = vi.fn();
const mockSubmitChatQuery = vi.fn();
const mockGetQueryResult = vi.fn();

vi.mock('@/lib/services', () => ({
  chatService: {
    streamChatResponse: (...args: unknown[]) => mockStreamChatResponse(...args),
    submitChatQuery: (...args: unknown[]) => mockSubmitChatQuery(...args),
    getQueryResult: (...args: unknown[]) => mockGetQueryResult(...args),
  },
}));

function createArkFinalChunk(opts: {
  arkTokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  openaiUsage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  phase?: string;
  raw?: string;
}) {
  return {
    id: 'chatcmpl-final',
    choices: [],
    ark: {
      completedQuery: {
        metadata: { name: 'test-query' },
        status: {
          phase: opts.phase || 'done',
          response: opts.raw ? { raw: opts.raw } : undefined,
          tokenUsage: opts.arkTokenUsage,
        },
      },
    },
    ...(opts.openaiUsage ? { usage: opts.openaiUsage } : {}),
  };
}

function createContentChunk(content: string, agent?: string) {
  return {
    id: 'chatcmpl-1',
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
    ...(agent ? { ark: { agent } } : {}),
  };
}

function createStopChunk() {
  return {
    id: 'chatcmpl-1',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  };
}

async function* asyncIterableFrom<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) {
    yield item;
  }
}

describe('useChatSession', () => {
  let store: ReturnType<typeof createStore>;

  function wrapper({ children }: { children: ReactNode }) {
    return React.createElement(Provider, { store }, children);
  }

  beforeEach(() => {
    store = createStore();
    store.set(storedIsChatStreamingEnabledAtom, true);
    store.set(lastConversationIdAtom, null);
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('initial state', () => {
    it('should return empty messages and a session ID', () => {
      const { result } = renderHook(
        () => useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper },
      );
      expect(result.current.messages).toEqual([]);
      expect(result.current.sessionId).toMatch(/^session-/);
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.tokenUsage).toBeUndefined();
      expect(result.current.messageTokenUsage).toBeUndefined();
    });
  });

  describe('token usage extraction from streaming', () => {
    it('should extract token usage from Ark metadata', async () => {
      mockStreamChatResponse.mockReturnValue(
        asyncIterableFrom([
          createContentChunk('Hello'),
          createStopChunk(),
          createArkFinalChunk({
            arkTokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          }),
        ]),
      );

      const { result } = renderHook(
        () => useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper },
      );

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      await waitFor(() => {
        expect(result.current.tokenUsage).toEqual({
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        });
      });
    });

    it('should fall back to OpenAI usage when Ark metadata is absent', async () => {
      mockStreamChatResponse.mockReturnValue(
        asyncIterableFrom([
          createContentChunk('Hello'),
          createStopChunk(),
          {
            id: 'chatcmpl-final',
            choices: [],
            ark: {
              completedQuery: {
                metadata: { name: 'test-query' },
                status: { phase: 'done' },
              },
            },
            usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 },
          },
        ]),
      );

      const { result } = renderHook(
        () => useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper },
      );

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      await waitFor(() => {
        expect(result.current.tokenUsage).toEqual({
          prompt_tokens: 200,
          completion_tokens: 80,
          total_tokens: 280,
        });
      });
    });

    it('should prefer Ark token usage over OpenAI usage when both present', async () => {
      mockStreamChatResponse.mockReturnValue(
        asyncIterableFrom([
          createContentChunk('Hello'),
          createStopChunk(),
          createArkFinalChunk({
            arkTokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            openaiUsage: { prompt_tokens: 999, completion_tokens: 999, total_tokens: 1998 },
          }),
        ]),
      );

      const { result } = renderHook(
        () => useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper },
      );

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      await waitFor(() => {
        expect(result.current.tokenUsage).toEqual({
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        });
      });
    });

    it('should handle missing token usage gracefully', async () => {
      mockStreamChatResponse.mockReturnValue(
        asyncIterableFrom([
          createContentChunk('Hello'),
          createStopChunk(),
          {
            id: 'chatcmpl-final',
            choices: [],
            ark: {
              completedQuery: {
                metadata: { name: 'test-query' },
                status: { phase: 'done' },
              },
            },
          },
        ]),
      );

      const { result } = renderHook(
        () => useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper },
      );

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
      });
      expect(result.current.tokenUsage).toBeUndefined();
    });
  });

  describe('token usage accumulation', () => {
    it('should accumulate token usage across multiple messages', async () => {
      mockStreamChatResponse
        .mockReturnValueOnce(
          asyncIterableFrom([
            createContentChunk('First'),
            createStopChunk(),
            createArkFinalChunk({
              arkTokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            }),
          ]),
        )
        .mockReturnValueOnce(
          asyncIterableFrom([
            createContentChunk('Second'),
            createStopChunk(),
            createArkFinalChunk({
              arkTokenUsage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
            }),
          ]),
        );

      const { result } = renderHook(
        () => useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper },
      );

      await act(async () => {
        await result.current.sendMessage('First message');
      });

      await waitFor(() => {
        expect(result.current.tokenUsage).toEqual({
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        });
      });

      await act(async () => {
        await result.current.sendMessage('Second message');
      });

      await waitFor(() => {
        expect(result.current.tokenUsage).toEqual({
          prompt_tokens: 300,
          completion_tokens: 150,
          total_tokens: 450,
        });
      });
    });

    it('should store per-message token usage', async () => {
      mockStreamChatResponse.mockReturnValue(
        asyncIterableFrom([
          createContentChunk('Hello'),
          createStopChunk(),
          createArkFinalChunk({
            arkTokenUsage: { promptTokens: 50, completionTokens: 25, totalTokens: 75 },
          }),
        ]),
      );

      const { result } = renderHook(
        () => useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper },
      );

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      await waitFor(() => {
        expect(result.current.messageTokenUsage).toBeDefined();
        const entries = Object.values(result.current.messageTokenUsage!);
        expect(entries.length).toBeGreaterThanOrEqual(1);
        expect(entries[0]).toEqual({
          prompt_tokens: 50,
          completion_tokens: 25,
          total_tokens: 75,
        });
      });
    });
  });

  describe('clearChat', () => {
    it('should reset token usage to zero when clearing chat', async () => {
      mockStreamChatResponse.mockReturnValue(
        asyncIterableFrom([
          createContentChunk('Hello'),
          createStopChunk(),
          createArkFinalChunk({
            arkTokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
          }),
        ]),
      );

      const { result } = renderHook(
        () => useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper },
      );

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      await waitFor(() => {
        expect(result.current.tokenUsage!.total_tokens).toBe(150);
      });

      act(() => {
        result.current.clearChat();
      });

      await waitFor(() => {
        expect(result.current.tokenUsage).toEqual({
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        });
        expect(result.current.messageTokenUsage).toEqual({});
        expect(result.current.messages).toEqual([]);
      });
    });
  });

  describe('error handling in streaming', () => {
    it('should handle error chunks from the stream', async () => {
      mockStreamChatResponse.mockReturnValue(
        asyncIterableFrom([
          {
            id: 'chatcmpl-err',
            choices: [],
            error: { message: 'Something went wrong', code: 'server_error' },
            ark: { query: 'bad-query' },
          },
        ]),
      );

      const { result } = renderHook(
        () => useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper },
      );

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
        const lastMessage = result.current.messages[result.current.messages.length - 1];
        expect(lastMessage.content).toBe('Something went wrong');
      });
    });

    it('should handle completed query error phase', async () => {
      mockStreamChatResponse.mockReturnValue(
        asyncIterableFrom([
          {
            id: 'chatcmpl-final',
            choices: [],
            ark: {
              completedQuery: {
                metadata: { name: 'err-query' },
                status: {
                  phase: 'error',
                  response: { content: 'Query execution failed' },
                },
              },
            },
          },
        ]),
      );

      const { result } = renderHook(
        () => useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper },
      );

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
        const lastMessage = result.current.messages[result.current.messages.length - 1];
        expect(lastMessage.content).toBe('Query execution failed');
      });
    });
  });

  describe('streaming content accumulation', () => {
    it('should accumulate content from multiple chunks', async () => {
      mockStreamChatResponse.mockReturnValue(
        asyncIterableFrom([
          createContentChunk('Hello'),
          createContentChunk(' world'),
          createContentChunk('!'),
          createStopChunk(),
        ]),
      );

      const { result } = renderHook(
        () => useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper },
      );

      await act(async () => {
        await result.current.sendMessage('Hi');
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
        const assistantMessages = result.current.messages.filter(
          m => m.role === 'assistant',
        );
        expect(assistantMessages.length).toBeGreaterThanOrEqual(1);
        const last = assistantMessages[assistantMessages.length - 1];
        expect(last.content).toBe('Hello world!');
      });
    });

    it('should handle tool call deltas in chunks', async () => {
      mockStreamChatResponse.mockReturnValue(
        asyncIterableFrom([
          {
            id: 'chatcmpl-1',
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      id: 'call_1',
                      function: { name: 'get_weather', arguments: '{"loc' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          {
            id: 'chatcmpl-1',
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    { id: 'call_1', function: { arguments: 'ation":"NYC"}' } },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          createStopChunk(),
          {
            id: 'chatcmpl-final',
            choices: [],
            ark: {
              completedQuery: {
                metadata: { name: 'test' },
                status: { phase: 'done' },
              },
            },
          },
        ]),
      );

      const { result } = renderHook(
        () => useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper },
      );

      await act(async () => {
        await result.current.sendMessage('Weather?');
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
        const assistantMsg = result.current.messages.find(
          m => m.role === 'assistant',
        );
        expect(assistantMsg).toBeDefined();
        const toolCalls = (assistantMsg as { tool_calls?: unknown[] }).tool_calls;
        expect(toolCalls).toBeDefined();
        expect(toolCalls!.length).toBe(1);
        const tc = toolCalls![0] as {
          id: string;
          function: { name: string; arguments: string };
        };
        expect(tc.id).toBe('call_1');
        expect(tc.function.name).toBe('get_weather');
        expect(tc.function.arguments).toBe('{"location":"NYC"}');
      });
    });
  });

  describe('agent switching', () => {
    it('should create separate messages when agent changes', async () => {
      mockStreamChatResponse.mockReturnValue(
        asyncIterableFrom([
          createContentChunk('From agent A', 'agent-a'),
          createStopChunk(),
          createContentChunk('From agent B', 'agent-b'),
          createStopChunk(),
          {
            id: 'chatcmpl-final',
            choices: [],
            ark: {
              completedQuery: {
                metadata: { name: 'test' },
                status: { phase: 'done' },
              },
            },
          },
        ]),
      );

      const { result } = renderHook(
        () => useChatSession({ name: 'test-agent', type: 'agent' }),
        { wrapper },
      );

      await act(async () => {
        await result.current.sendMessage('Hello team');
      });

      await waitFor(() => {
        expect(result.current.isProcessing).toBe(false);
        const assistantMessages = result.current.messages.filter(
          m => m.role === 'assistant',
        );
        expect(assistantMessages.length).toBeGreaterThanOrEqual(2);
      });
    });
  });
});
