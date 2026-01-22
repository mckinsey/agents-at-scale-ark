import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import type { QueryDetailResponse } from '@/lib/services/chat';
import { chatService } from '@/lib/services/chat';

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/analytics/singleton', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/lib/utils/uuid', () => ({
  generateUUID: vi.fn(() => 'test-uuid-123'),
}));

describe('chatService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createQuery', () => {
    it('should create a query with normalized target type', async () => {
      const mockResponse: QueryDetailResponse = {
        name: 'test-query',
        type: 'messages',
        input: 'test input',
        status: { phase: 'pending' },
      };

      vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

      const result = await chatService.createQuery({
        name: 'test-query',
        type: 'messages',
        input: 'test input',
        target: { name: 'TestAgent', type: 'AGENT' },
      });

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/queries/', {
        name: 'test-query',
        type: 'messages',
        input: 'test input',
        target: { name: 'TestAgent', type: 'agent' },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle query without target', async () => {
      const mockResponse: QueryDetailResponse = {
        name: 'test-query',
        type: 'messages',
        input: 'test input',
        status: { phase: 'pending' },
      };

      vi.mocked(apiClient.post).mockResolvedValue(mockResponse);

      await chatService.createQuery({
        name: 'test-query',
        type: 'messages',
        input: 'test input',
      });

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/queries/', {
        name: 'test-query',
        type: 'messages',
        input: 'test input',
        target: undefined,
      });
    });
  });

  describe('getQuery', () => {
    it('should return query detail', async () => {
      const mockQuery: QueryDetailResponse = {
        name: 'query-123',
        type: 'messages',
        input: 'test',
        status: { phase: 'done' },
      };

      vi.mocked(apiClient.get).mockResolvedValue(mockQuery);

      const result = await chatService.getQuery('query-123');

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/queries/query-123');
      expect(result).toEqual(mockQuery);
    });

    it('should return null for 404 responses', async () => {
      const error = new Error('Not found');
      (error as any).response = { status: 404 };
      vi.mocked(apiClient.get).mockRejectedValue(error);

      const result = await chatService.getQuery('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw non-404 errors', async () => {
      const error = new Error('Server error');
      (error as any).response = { status: 500 };
      vi.mocked(apiClient.get).mockRejectedValue(error);

      await expect(chatService.getQuery('query-123')).rejects.toThrow(
        'Server error',
      );
    });
  });

  describe('listQueries', () => {
    it('should list all queries', async () => {
      const mockList = {
        items: [
          { name: 'query-1', type: 'messages', input: 'test1' },
          { name: 'query-2', type: 'messages', input: 'test2' },
        ],
      };

      vi.mocked(apiClient.get).mockResolvedValue(mockList);

      const result = await chatService.listQueries();

      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/queries/');
      expect(result).toEqual(mockList);
    });
  });

  describe('updateQuery', () => {
    it('should update query', async () => {
      const mockUpdated: QueryDetailResponse = {
        name: 'query-123',
        type: 'messages',
        input: 'updated input',
        status: { phase: 'done' },
      };

      vi.mocked(apiClient.put).mockResolvedValue(mockUpdated);

      const result = await chatService.updateQuery('query-123', {
        input: 'updated input',
      });

      expect(apiClient.put).toHaveBeenCalledWith('/api/v1/queries/query-123', {
        input: 'updated input',
      });
      expect(result).toEqual(mockUpdated);
    });

    it('should return null for 404 responses', async () => {
      const error = new Error('Not found');
      (error as any).response = { status: 404 };
      vi.mocked(apiClient.put).mockRejectedValue(error);

      const result = await chatService.updateQuery('nonexistent', {
        input: 'test',
      });

      expect(result).toBeNull();
    });

    it('should throw non-404 errors', async () => {
      const error = new Error('Server error');
      (error as any).response = { status: 500 };
      vi.mocked(apiClient.put).mockRejectedValue(error);

      await expect(
        chatService.updateQuery('query-123', { input: 'test' }),
      ).rejects.toThrow('Server error');
    });
  });

  describe('deleteQuery', () => {
    it('should delete query and return true', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(undefined);

      const result = await chatService.deleteQuery('query-123');

      expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/queries/query-123');
      expect(result).toBe(true);
    });

    it('should return false for 404 responses', async () => {
      const error = new Error('Not found');
      (error as any).response = { status: 404 };
      vi.mocked(apiClient.delete).mockRejectedValue(error);

      const result = await chatService.deleteQuery('nonexistent');

      expect(result).toBe(false);
    });

    it('should throw non-404 errors', async () => {
      const error = new Error('Server error');
      (error as any).response = { status: 500 };
      vi.mocked(apiClient.delete).mockRejectedValue(error);

      await expect(chatService.deleteQuery('query-123')).rejects.toThrow(
        'Server error',
      );
    });
  });

  describe('submitChatQuery', () => {
    beforeEach(() => {
      vi.mocked(apiClient.post).mockResolvedValue({
        name: 'chat-query-test-uuid-123',
        type: 'messages',
        status: { phase: 'pending' },
      } as QueryDetailResponse);
    });

    it('should submit chat query with messages', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello' },
      ];

      await chatService.submitChatQuery(messages, 'agent', 'TestAgent');

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/queries/', {
        name: 'chat-query-test-uuid-123',
        type: 'messages',
        input: messages,
        target: { type: 'agent', name: 'TestAgent' },
        sessionId: undefined,
        timeout: undefined,
      });
    });

    it('should normalize target type to lowercase', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello' },
      ];

      await chatService.submitChatQuery(messages, 'AGENT', 'TestAgent');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/queries/',
        expect.objectContaining({
          target: { type: 'agent', name: 'TestAgent' },
        }),
      );
    });

    it('should include sessionId when provided', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello' },
      ];

      await chatService.submitChatQuery(
        messages,
        'agent',
        'TestAgent',
        'session-123',
      );

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/queries/',
        expect.objectContaining({
          sessionId: 'session-123',
        }),
      );
    });

    it('should include timeout when provided', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello' },
      ];

      await chatService.submitChatQuery(
        messages,
        'agent',
        'TestAgent',
        undefined,
        undefined,
        '5m',
      );

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/queries/',
        expect.objectContaining({
          timeout: '5m',
        }),
      );
    });

    it('should include both sessionId and timeout when provided', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello' },
      ];

      await chatService.submitChatQuery(
        messages,
        'agent',
        'TestAgent',
        'session-456',
        false,
        '10m',
      );

      expect(apiClient.post).toHaveBeenCalledWith('/api/v1/queries/', {
        name: 'chat-query-test-uuid-123',
        type: 'messages',
        input: messages,
        target: { type: 'agent', name: 'TestAgent' },
        sessionId: 'session-456',
        timeout: '10m',
      });
    });

    it('should handle enableStreaming parameter', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hello' },
      ];

      await chatService.submitChatQuery(
        messages,
        'agent',
        'TestAgent',
        undefined,
        true,
      );

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/queries/',
        expect.objectContaining({
          metadata: {
            annotations: {
              'ark.mckinsey.com/streaming-enabled': 'false',
            },
          },
        }),
      );
    });

    it('should support multimodal messages', async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
          ],
        },
      ];

      await chatService.submitChatQuery(messages, 'agent', 'VisionAgent');

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/queries/',
        expect.objectContaining({
          input: messages,
        }),
      );
    });
  });

  describe('getChatHistory', () => {
    it('should filter and sort chat queries by name', async () => {
      const mockResponse = {
        items: [
          {
            name: 'chat-query-300',
            type: 'messages',
            input: 'msg3',
            status: { phase: 'done' },
          },
          {
            name: 'other-query-100',
            type: 'messages',
            input: 'other',
            status: { phase: 'done' },
          },
          {
            name: 'chat-query-100',
            type: 'messages',
            input: 'msg1',
            status: { phase: 'done' },
          },
          {
            name: 'chat-query-200',
            type: 'messages',
            input: 'msg2',
            status: { phase: 'done' },
          },
        ],
      };

      vi.mocked(apiClient.get).mockResolvedValue(mockResponse);

      const result = await chatService.getChatHistory('session-123');

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('chat-query-100');
      expect(result[1].name).toBe('chat-query-200');
      expect(result[2].name).toBe('chat-query-300');
      expect(result.every(item => item.sessionId === 'session-123')).toBe(true);
    });

    it('should handle empty results', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ items: [] });

      const result = await chatService.getChatHistory('session-123');

      expect(result).toEqual([]);
    });
  });

  describe('getQueryResult', () => {
    it('should return done status with response', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        name: 'query-123',
        status: {
          phase: 'done',
          response: { content: 'Success!' },
        },
      });

      const result = await chatService.getQueryResult('query-123');

      expect(result).toEqual({
        status: 'done',
        terminal: true,
        response: 'Success!',
      });
    });

    it('should return running status as non-terminal', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        name: 'query-123',
        status: { phase: 'running' },
      });

      const result = await chatService.getQueryResult('query-123');

      expect(result).toEqual({
        status: 'running',
        terminal: false,
        response: 'No response',
      });
    });

    it('should return pending status as non-terminal', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        name: 'query-123',
        status: { phase: 'pending' },
      });

      const result = await chatService.getQueryResult('query-123');

      expect(result).toEqual({
        status: 'pending',
        terminal: false,
        response: 'No response',
      });
    });

    it('should return error status as terminal', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        name: 'query-123',
        status: {
          phase: 'error',
          response: { content: 'Failed' },
        },
      });

      const result = await chatService.getQueryResult('query-123');

      expect(result).toEqual({
        status: 'error',
        terminal: true,
        response: 'Failed',
      });
    });

    it('should return canceled status as terminal', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        name: 'query-123',
        status: { phase: 'canceled' },
      });

      const result = await chatService.getQueryResult('query-123');

      expect(result).toEqual({
        status: 'canceled',
        terminal: true,
        response: 'No response',
      });
    });

    it('should return unknown for invalid phase', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        name: 'query-123',
        status: { phase: 'invalid-phase' },
      });

      const result = await chatService.getQueryResult('query-123');

      expect(result).toEqual({
        status: 'unknown',
        terminal: true,
        response: 'No response',
      });
    });

    it('should return unknown when query is null', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(null);

      const result = await chatService.getQueryResult('query-123');

      expect(result).toEqual({
        status: 'unknown',
        terminal: false,
      });
    });

    it('should return error on exception', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

      const result = await chatService.getQueryResult('query-123');

      expect(result).toEqual({
        status: 'error',
        terminal: true,
      });
    });
  });

  describe('streamQueryStatus', () => {
    it('should poll until terminal status', async () => {
      vi.mocked(apiClient.get)
        .mockResolvedValueOnce({
          name: 'query-123',
          status: { phase: 'pending' },
        })
        .mockResolvedValueOnce({
          name: 'query-123',
          status: { phase: 'running' },
        })
        .mockResolvedValueOnce({
          name: 'query-123',
          status: { phase: 'done', response: { content: 'Complete' } },
        });

      const onUpdate = vi.fn();
      await chatService.streamQueryStatus('query-123', onUpdate, 10);

      await vi.waitFor(
        () => {
          expect(onUpdate).toHaveBeenCalledTimes(3);
        },
        { timeout: 1000 },
      );

      expect(onUpdate).toHaveBeenNthCalledWith(1, { phase: 'pending' });
      expect(onUpdate).toHaveBeenNthCalledWith(2, { phase: 'running' });
      expect(onUpdate).toHaveBeenNthCalledWith(3, {
        phase: 'done',
        response: { content: 'Complete' },
      });
    });

    it('should stop polling on terminal status', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        name: 'query-123',
        status: { phase: 'done' },
      });

      const onUpdate = vi.fn();
      await chatService.streamQueryStatus('query-123', onUpdate, 10);

      await vi.waitFor(
        () => {
          expect(onUpdate).toHaveBeenCalledTimes(1);
        },
        { timeout: 1000 },
      );
    });

    it('should return stop function', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({
        name: 'query-123',
        status: { phase: 'running' },
      });

      const onUpdate = vi.fn();
      const stop = await chatService.streamQueryStatus('query-123', onUpdate, 50);

      await vi.waitFor(
        () => {
          expect(onUpdate).toHaveBeenCalledTimes(1);
        },
        { timeout: 200 },
      );

      stop();

      const callCountBeforeStop = onUpdate.mock.calls.length;
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(onUpdate).toHaveBeenCalledTimes(callCountBeforeStop);
    });

    it('should handle polling errors gracefully', async () => {
      vi.mocked(apiClient.get)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          name: 'query-123',
          status: { phase: 'done' },
        });

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const onUpdate = vi.fn();

      await chatService.streamQueryStatus('query-123', onUpdate, 10);

      await vi.waitFor(
        () => {
          expect(consoleErrorSpy).toHaveBeenCalled();
        },
        { timeout: 1000 },
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('parseSSEChunk', () => {
    it('should parse valid SSE data line', () => {
      const line = 'data: {"id":"1","content":"hello"}';
      const result = chatService.parseSSEChunk(line);

      expect(result).toEqual({ id: '1', content: 'hello' });
    });

    it('should return null for [DONE] marker', () => {
      const line = 'data: [DONE]';
      const result = chatService.parseSSEChunk(line);

      expect(result).toBeNull();
    });

    it('should return null for empty line', () => {
      const line = '';
      const result = chatService.parseSSEChunk(line);

      expect(result).toBeNull();
    });

    it('should return null for whitespace-only line', () => {
      const line = '   ';
      const result = chatService.parseSSEChunk(line);

      expect(result).toBeNull();
    });

    it('should return null for non-data line', () => {
      const line = 'event: message';
      const result = chatService.parseSSEChunk(line);

      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const line = 'data: {invalid json}';
      const result = chatService.parseSSEChunk(line);

      expect(result).toBeNull();
    });

    it('should handle data line with extra whitespace', () => {
      const line = 'data:   {"id":"1"}  ';
      const result = chatService.parseSSEChunk(line);

      expect(result).toEqual({ id: '1' });
    });
  });

  describe('streamChatResponse', () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
      global.fetch = mockFetch;
      vi.clearAllMocks();
    });

    it('should stream chat response chunks', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"content":"Hello"}\n\n'),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"content":"World"}\n\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hi' },
      ];

      const chunks: Record<string, unknown>[] = [];
      for await (const chunk of chatService.streamChatResponse(
        messages,
        'agent',
        'TestAgent',
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([{ content: 'Hello' }, { content: 'World' }]);
      expect(mockFetch).toHaveBeenCalledWith('/api/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'agent/TestAgent',
          messages,
          stream: true,
          metadata: {},
        }),
      });
    });

    it('should include sessionId in metadata when provided', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hi' },
      ];

      for await (const _ of chatService.streamChatResponse(
        messages,
        'agent',
        'TestAgent',
        'session-123',
      )) {
      }

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/openai/v1/chat/completions',
        expect.objectContaining({
          body: expect.stringContaining('"sessionId":"session-123"'),
        }),
      );
    });

    it('should include timeout in metadata when provided', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hi' },
      ];

      for await (const _ of chatService.streamChatResponse(
        messages,
        'agent',
        'TestAgent',
        undefined,
        '5m',
      )) {
      }

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/openai/v1/chat/completions',
        expect.objectContaining({
          body: expect.stringContaining('"timeout":"5m"'),
        }),
      );
    });

    it('should include both sessionId and timeout in metadata', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hi' },
      ];

      for await (const _ of chatService.streamChatResponse(
        messages,
        'agent',
        'TestAgent',
        'session-456',
        '10m',
      )) {
      }

      const fetchCall = mockFetch.mock.calls[0][1];
      const body = JSON.parse(fetchCall.body);

      expect(body.metadata).toEqual({
        sessionId: 'session-456',
        timeout: '10m',
      });
    });

    it('should handle buffered chunks across reads', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"con'),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('tent":"Hello"}\n\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hi' },
      ];

      const chunks: Record<string, unknown>[] = [];
      for await (const chunk of chatService.streamChatResponse(
        messages,
        'agent',
        'TestAgent',
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([{ content: 'Hello' }]);
    });

    it('should skip [DONE] markers', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"content":"Hello"}\n\n'),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: [DONE]\n\n'),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hi' },
      ];

      const chunks: Record<string, unknown>[] = [];
      for await (const chunk of chatService.streamChatResponse(
        messages,
        'agent',
        'TestAgent',
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([{ content: 'Hello' }]);
    });

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hi' },
      ];

      await expect(async () => {
        for await (const _ of chatService.streamChatResponse(
          messages,
          'agent',
          'TestAgent',
        )) {
        }
      }).rejects.toThrow('Failed to connect to stream: Internal Server Error');
    });

    it('should throw error when no response body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        body: null,
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hi' },
      ];

      await expect(async () => {
        for await (const _ of chatService.streamChatResponse(
          messages,
          'agent',
          'TestAgent',
        )) {
        }
      }).rejects.toThrow('No response body available for streaming');
    });

    it('should release reader lock when done', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hi' },
      ];

      for await (const _ of chatService.streamChatResponse(
        messages,
        'agent',
        'TestAgent',
      )) {
      }

      expect(mockReader.releaseLock).toHaveBeenCalled();
    });

    it('should release reader lock on error', async () => {
      const mockReader = {
        read: vi.fn().mockRejectedValue(new Error('Read error')),
        releaseLock: vi.fn(),
      };

      mockFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: 'user', content: 'Hi' },
      ];

      await expect(async () => {
        for await (const _ of chatService.streamChatResponse(
          messages,
          'agent',
          'TestAgent',
        )) {
        }
      }).rejects.toThrow('Read error');

      expect(mockReader.releaseLock).toHaveBeenCalled();
    });
  });
});
