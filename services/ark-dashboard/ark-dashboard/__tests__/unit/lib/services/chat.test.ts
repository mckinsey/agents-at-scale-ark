import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api/client';
import { chatService } from '@/lib/services/chat';
import type {
  QueryDetailResponse,
  QueryListResponse,
} from '@/lib/services/chat';

// Mock the API client
vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: vi.fn(() => 'mock-uuid'),
  },
  writable: true,
});

describe('chatService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('createQuery', () => {
    it('should create query with normalized target types', async () => {
      const mockResponse: QueryDetailResponse = {
        name: 'test-query',
        input: 'Test input',
        target: { type: 'agent', name: 'agent1' },
        status: { phase: 'pending' },
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const queryRequest = {
        name: 'test-query',
        input: 'Test input',
        target: { type: 'AGENT', name: 'agent1' },
      };

      const result = await chatService.createQuery(queryRequest);

      expect(apiClient.post).toHaveBeenCalledWith(`/api/v1/queries/`, {
        ...queryRequest,
        target: { type: 'agent', name: 'agent1' },
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getQuery', () => {
    it('should fetch query by name', async () => {
      const mockQuery: QueryDetailResponse = {
        name: 'test-query',
        input: 'Test',
        status: { phase: 'done' },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockQuery);

      const result = await chatService.getQuery('test-query');

      expect(apiClient.get).toHaveBeenCalledWith(`/api/v1/queries/test-query`);
      expect(result).toEqual(mockQuery);
    });

    it('should return null for 404 errors', async () => {
      const error = new Error('Not found') as any;
      error.response = { status: 404 };
      vi.mocked(apiClient.get).mockRejectedValueOnce(error);

      const result = await chatService.getQuery('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('submitChatQuery', () => {
    it('should create chat query with generated name', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const mockResponse: QueryDetailResponse = {
        name: 'chat-query-mock-uuid',
        input: messages,
        target: { type: 'agent', name: 'test-agent' },
        status: { phase: 'pending' },
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const result = await chatService.submitChatQuery(
        messages,
        'agent',
        'test-agent',
        'session-123',
      );

      expect(apiClient.post).toHaveBeenCalledWith(`/api/v1/queries/`, {
        name: 'chat-query-mock-uuid',
        type: 'messages',
        input: messages,
        target: { type: 'agent', name: 'test-agent' },
        sessionId: 'session-123',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should add streaming annotation when enableStreaming is true', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const mockResponse: QueryDetailResponse = {
        name: 'chat-query-mock-uuid',
        input: messages,
        target: { type: 'agent', name: 'test-agent' },
        status: { phase: 'pending' },
        metadata: {
          annotations: {
            'ark.mckinsey.com/streaming-enabled': 'false',
          },
        },
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const result = await chatService.submitChatQuery(
        messages,
        'agent',
        'test-agent',
        'session-123',
        true, // enableStreaming
      );

      expect(apiClient.post).toHaveBeenCalledWith(`/api/v1/queries/`, {
        name: 'chat-query-mock-uuid',
        type: 'messages',
        input: messages,
        target: { type: 'agent', name: 'test-agent' },
        sessionId: 'session-123',
        metadata: {
          annotations: {
            'ark.mckinsey.com/streaming-enabled': 'false',
          },
        },
      });
      expect(result).toEqual(mockResponse);
    });

    it('should not add streaming annotation when enableStreaming is false or undefined', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const mockResponse: QueryDetailResponse = {
        name: 'chat-query-mock-uuid',
        input: messages,
        target: { type: 'agent', name: 'test-agent' },
        status: { phase: 'pending' },
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const result = await chatService.submitChatQuery(
        messages,
        'agent',
        'test-agent',
        'session-123',
        false, // enableStreaming
      );

      expect(apiClient.post).toHaveBeenCalledWith(`/api/v1/queries/`, {
        name: 'chat-query-mock-uuid',
        type: 'messages',
        input: messages,
        target: { type: 'agent', name: 'test-agent' },
        sessionId: 'session-123',
      });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getQueryResult', () => {
    it('should return terminal status for completed query', async () => {
      const mockQuery: QueryDetailResponse = {
        name: 'test-query',
        input: 'Test',
        status: {
          phase: 'done',
          response: { content: 'Query completed successfully' },
        },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockQuery);

      const result = await chatService.getQueryResult('test-query');

      expect(result).toEqual({
        status: 'done',
        terminal: true,
        response: 'Query completed successfully',
      });
    });

    it('should return non-terminal status for running query', async () => {
      const mockQuery: QueryDetailResponse = {
        name: 'test-query',
        input: 'Test',
        status: {
          phase: 'running',
        },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockQuery);

      const result = await chatService.getQueryResult('test-query');

      expect(result).toEqual({
        status: 'running',
        terminal: false,
        response: 'No response',
      });
    });

    it('should handle unknown phase', async () => {
      const mockQuery: QueryDetailResponse = {
        name: 'test-query',
        input: 'Test',
        status: {
          phase: 'invalid-phase',
        },
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockQuery);

      const result = await chatService.getQueryResult('test-query');

      expect(result).toEqual({
        status: 'unknown',
        terminal: true,
        response: 'No response',
      });
    });

    it('should handle errors', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const result = await chatService.getQueryResult('test-query');

      expect(result).toEqual({
        status: 'error',
        terminal: true,
      });
    });
  });

  describe('streamQueryStatus', () => {
    it('should poll query status until completed', async () => {
      vi.useFakeTimers();

      const mockStatuses = [
        { phase: 'pending' },
        { phase: 'running' },
        { phase: 'Completed' },
      ];

      let callCount = 0;
      vi.mocked(apiClient.get).mockImplementation(() => {
        const query: QueryDetailResponse = {
          name: 'test-query',
          input: 'Test',
          status: mockStatuses[callCount++],
        };
        return Promise.resolve(query);
      });

      const onUpdate = vi.fn();
      const stop = await chatService.streamQueryStatus(
        'test-query',
        onUpdate,
        100,
      );

      // Advance timers to trigger polling
      await vi.advanceTimersByTimeAsync(250);

      expect(onUpdate).toHaveBeenCalledTimes(3);
      expect(onUpdate).toHaveBeenNthCalledWith(1, { phase: 'pending' });
      expect(onUpdate).toHaveBeenNthCalledWith(2, { phase: 'running' });
      expect(onUpdate).toHaveBeenNthCalledWith(3, { phase: 'Completed' });

      stop();
      vi.useRealTimers();
    });

    it('should handle polling errors', async () => {
      vi.useFakeTimers();

      vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

      const onUpdate = vi.fn();
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const stop = await chatService.streamQueryStatus(
        'test-query',
        onUpdate,
        100,
      );

      await vi.advanceTimersByTimeAsync(150);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error polling query status:',
        expect.any(Error),
      );
      expect(onUpdate).not.toHaveBeenCalled();

      stop();
      consoleErrorSpy.mockRestore();
      vi.useRealTimers();
    });

    it('should stop polling when stop function is called', async () => {
      vi.useFakeTimers();

      let callCount = 0;
      vi.mocked(apiClient.get).mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          name: 'test-query',
          input: 'Test',
          status: { phase: 'running' },
        } as QueryDetailResponse);
      });

      const onUpdate = vi.fn();
      const stop = await chatService.streamQueryStatus(
        'test-query',
        onUpdate,
        100,
      );

      await vi.advanceTimersByTimeAsync(150);
      expect(callCount).toBe(2);

      stop();

      await vi.advanceTimersByTimeAsync(200);
      expect(callCount).toBe(2); // No more calls after stop

      vi.useRealTimers();
    });
  });

  describe('getChatHistory', () => {
    it('should filter and sort chat queries', async () => {
      const mockListResponse: QueryListResponse = {
        items: [
          { name: 'other-query', input: 'Other', status: {} },
          { name: 'chat-query-1000', input: 'First', status: {} },
          { name: 'chat-query-2000', input: 'Second', status: {} },
          { name: 'chat-query-1500', input: 'Middle', status: {} },
        ],
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockListResponse);

      const result = await chatService.getChatHistory('session-123');

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('chat-query-1000');
      expect(result[1].name).toBe('chat-query-1500');
      expect(result[2].name).toBe('chat-query-2000');

      // Check that sessionId is added
      expect(result[0].sessionId).toBe('session-123');
    });
  });

  describe('listQueries', () => {
    it('should list all queries', async () => {
      const mockResponse: QueryListResponse = {
        items: [
          { name: 'query1', input: 'Test 1', status: {} },
          { name: 'query2', input: 'Test 2', status: {} },
        ],
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      const result = await chatService.listQueries();

      expect(apiClient.get).toHaveBeenCalledWith(`/api/v1/queries/`);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateQuery', () => {
    it('should update query', async () => {
      const mockResponse: QueryDetailResponse = {
        name: 'test-query',
        input: 'Updated input',
        status: { phase: 'done' },
      };

      vi.mocked(apiClient.put).mockResolvedValueOnce(mockResponse);

      const updates = { input: 'Updated input' };
      const result = await chatService.updateQuery('test-query', updates);

      expect(apiClient.put).toHaveBeenCalledWith(
        `/api/v1/queries/test-query`,
        updates,
      );
      expect(result).toEqual(mockResponse);
    });

    it('should return null for 404 errors', async () => {
      const error = new Error('Not found') as any;
      error.response = { status: 404 };
      vi.mocked(apiClient.put).mockRejectedValueOnce(error);

      const result = await chatService.updateQuery('non-existent', {});

      expect(result).toBeNull();
    });
  });

  describe('deleteQuery', () => {
    it('should delete query and return true', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      const result = await chatService.deleteQuery('test-query');

      expect(apiClient.delete).toHaveBeenCalledWith(
        `/api/v1/queries/test-query`,
      );
      expect(result).toBe(true);
    });

    it('should return false for 404 errors', async () => {
      const error = new Error('Not found') as any;
      error.response = { status: 404 };
      vi.mocked(apiClient.delete).mockRejectedValueOnce(error);

      const result = await chatService.deleteQuery('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('parseSSEChunk', () => {
    it('should return null for [DONE] marker', () => {
      const sseLine = 'data: [DONE]';
      const result = chatService.parseSSEChunk(sseLine);

      expect(result).toBeNull();
    });

    it('should return null for empty lines', () => {
      expect(chatService.parseSSEChunk('')).toBeNull();
      expect(chatService.parseSSEChunk('   ')).toBeNull();
    });

    it('should return null for lines without data: prefix', () => {
      const result = chatService.parseSSEChunk('{"id":"test"}');
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const sseLine = 'data: {invalid json}';
      const result = chatService.parseSSEChunk(sseLine);

      expect(result).toBeNull();
    });

    it('should handle SSE lines with extra whitespace', () => {
      const sseLine = '  data:   {"id":"test"}  ';
      const result = chatService.parseSSEChunk(sseLine);

      expect(result).toEqual({ id: 'test' });
    });

    it('should parse valid SSE data line into JSON object', () => {
      const sseLine =
        'data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"Hello"}}]}';
      const result = chatService.parseSSEChunk(sseLine);

      expect(result).toEqual({
        id: 'chatcmpl-123',
        choices: [{ delta: { content: 'Hello' } }],
      });
    });
  });

  describe('streamChatResponse', () => {
    it('should yield parsed chunks from SSE stream', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const mockQueryResponse = {
        name: 'chat-query-mock-uuid',
        input: messages,
        target: { type: 'agent', name: 'test-agent' },
        status: { phase: 'pending' },
      } as unknown as QueryDetailResponse;

      // Mock the query creation
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockQueryResponse);

      // Mock fetch for streaming response
      const mockSSEData = [
        'data: {"id":"1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"id":"2","choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: [DONE]\n\n',
      ].join('');

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(mockSSEData),
              })
              .mockResolvedValueOnce({ done: true }),
            releaseLock: vi.fn(),
          }),
        },
      });

      const chunks = [];
      for await (const chunk of chatService.streamChatResponse(
        messages,
        'agent',
        'test-agent',
        'session-123',
      )) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({
        id: '1',
        choices: [{ delta: { content: 'Hello' } }],
      });
      expect(chunks[1]).toEqual({
        id: '2',
        choices: [{ delta: { content: ' world' } }],
      });
    });

    it('should throw error when fetch fails', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const mockQueryResponse: QueryDetailResponse = {
        name: 'chat-query-mock-uuid',
        input: messages,
        target: { type: 'agent', name: 'test-agent' },
        status: { phase: 'pending' },
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockQueryResponse);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      });

      const generator = chatService.streamChatResponse(
        messages,
        'agent',
        'test-agent',
        'session-123',
      );

      await expect(generator.next()).rejects.toThrow(
        'Failed to connect to stream: Internal Server Error',
      );
    });

    it('should throw error when response has no body', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const mockQueryResponse: QueryDetailResponse = {
        name: 'chat-query-mock-uuid',
        input: messages,
        target: { type: 'agent', name: 'test-agent' },
        status: { phase: 'pending' },
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce(mockQueryResponse);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        body: null,
      });

      const generator = chatService.streamChatResponse(
        messages,
        'agent',
        'test-agent',
        'session-123',
      );

      await expect(generator.next()).rejects.toThrow(
        'No response body available for streaming',
      );
    });
  });
});
