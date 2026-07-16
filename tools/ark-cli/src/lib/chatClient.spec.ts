import {vi} from 'vitest';
import {QUERY_ANNOTATIONS} from './constants.js';

const mockCreateQuery = vi.fn() as any;
const mockGetQuery = vi.fn() as any;

const mockArkApiClient = {
  createQuery: mockCreateQuery,
  getQuery: mockGetQuery,
  getQueryTargets: vi.fn() as any,
  getBaseUrl: vi.fn().mockReturnValue('http://localhost:8000'),
} as any;

const {ChatClient} = await import('./chatClient.js');

describe('ChatClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('should include sessionId in query when provided', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'test-query-1'});
      mockGetQuery.mockResolvedValue({
        status: {
          phase: 'done',
          response: {content: 'Hello'},
        },
      });

      await client.sendMessage(
        'agent/test-agent',
        [{role: 'user', content: 'Hello'}],
        {streamingEnabled: false, sessionId: 'test-session-123'}
      );

      expect(mockCreateQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          input: 'Hello',
          target: {type: 'agent', name: 'test-agent'},
          sessionId: 'test-session-123',
        })
      );
    });

    it('should include a2aContextId as annotation when provided', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'test-query-2'});
      mockGetQuery.mockResolvedValue({
        status: {
          phase: 'done',
          response: {content: 'Hello'},
        },
      });

      await client.sendMessage(
        'agent/test-agent',
        [{role: 'user', content: 'Hello'}],
        {
          streamingEnabled: false,
          sessionId: 'test-session-123',
          a2aContextId: 'a2a-context-456',
        }
      );

      expect(mockCreateQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            annotations: expect.objectContaining({
              [QUERY_ANNOTATIONS.A2A_CONTEXT_ID]: 'a2a-context-456',
            }),
          }),
        })
      );
    });

    it('should poll for query completion in non-streaming mode', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'test-query-3'});
      mockGetQuery.mockResolvedValue({
        status: {
          phase: 'done',
          response: {content: 'Response content'},
        },
      });

      const result = await client.sendMessage(
        'agent/test-agent',
        [{role: 'user', content: 'Hello'}],
        {streamingEnabled: false}
      );

      expect(result).toBe('Response content');
      expect(mockGetQuery).toHaveBeenCalledWith('test-query-3');
    });

    it('should extract last user message from messages array', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'test-query-4'});
      mockGetQuery.mockResolvedValue({
        status: {
          phase: 'done',
          response: {content: 'Done'},
        },
      });

      await client.sendMessage(
        'agent/test-agent',
        [
          {role: 'user', content: 'First'},
          {role: 'assistant', content: 'Reply'},
          {role: 'user', content: 'Second'},
        ],
        {streamingEnabled: false}
      );

      expect(mockCreateQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          input: 'Second',
        })
      );
    });

    it('should throw on query error', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'test-query-5'});
      mockGetQuery.mockResolvedValue({
        status: {
          phase: 'error',
          response: {content: 'Something went wrong'},
        },
      });

      await expect(
        client.sendMessage(
          'agent/test-agent',
          [{role: 'user', content: 'Hello'}],
          {streamingEnabled: false}
        )
      ).rejects.toThrow('Something went wrong');
    });

    it('should not include metadata when no config options set', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'test-query-6'});
      mockGetQuery.mockResolvedValue({
        status: {
          phase: 'done',
          response: {content: 'Hello'},
        },
      });

      await client.sendMessage(
        'agent/test-agent',
        [{role: 'user', content: 'Hello'}],
        {streamingEnabled: false}
      );

      const callArgs = mockCreateQuery.mock.calls[0][0];
      expect(callArgs.metadata).toBeUndefined();
    });

    it('should parse target from model string', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'test-query-7'});
      mockGetQuery.mockResolvedValue({
        status: {
          phase: 'done',
          response: {content: 'Result'},
        },
      });

      await client.sendMessage(
        'tool/my-tool',
        [{role: 'user', content: '{"input": "test"}'}],
        {streamingEnabled: false}
      );

      expect(mockCreateQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          target: {type: 'tool', name: 'my-tool'},
        })
      );
    });

    it('should throw when query creation returns no name', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({});

      await expect(
        client.sendMessage(
          'agent/test-agent',
          [{role: 'user', content: 'Hello'}],
          {streamingEnabled: false}
        )
      ).rejects.toThrow('Query creation did not return a name');
    });

    it('should include streaming annotation when streaming enabled with onChunk', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'test-query-stream'});

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn().mockResolvedValue({done: true, value: undefined}),
            releaseLock: vi.fn(),
          }),
        },
      });
      vi.stubGlobal('fetch', mockFetch);

      await client.sendMessage(
        'agent/test-agent',
        [{role: 'user', content: 'Hello'}],
        {streamingEnabled: true},
        vi.fn()
      );

      expect(mockCreateQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            annotations: expect.objectContaining({
              'ark.mckinsey.com/streaming-enabled': 'true',
            }),
          }),
        })
      );

      vi.unstubAllGlobals();
    });

    it('should include conversationId when provided', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'test-query-conv'});
      mockGetQuery.mockResolvedValue({
        status: {phase: 'done', response: {content: 'OK'}},
      });

      await client.sendMessage(
        'agent/test-agent',
        [{role: 'user', content: 'Hello'}],
        {streamingEnabled: false, conversationId: 'conv-123'}
      );

      expect(mockCreateQuery).toHaveBeenCalledWith(
        expect.objectContaining({conversationId: 'conv-123'})
      );
    });
  });

  describe('pollResponse', () => {
    it('should poll until done and return content', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'poll-q'});
      mockGetQuery
        .mockResolvedValueOnce({status: {phase: 'running'}})
        .mockResolvedValueOnce({status: {phase: 'done', response: {content: 'Final'}}});

      const result = await client.sendMessage(
        'agent/a',
        [{role: 'user', content: 'Hi'}],
        {streamingEnabled: false}
      );

      expect(result).toBe('Final');
      expect(mockGetQuery).toHaveBeenCalledTimes(2);
    });

    it('should extract tool calls from raw response', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'tool-q'});
      const rawMessages = JSON.stringify([
        {
          tool_calls: [
            {id: 'tc1', type: 'function', function: {name: 'search', arguments: '{"q":"test"}'}},
          ],
        },
      ]);
      mockGetQuery.mockResolvedValue({
        status: {
          phase: 'done',
          response: {content: '', raw: rawMessages},
        },
      });

      const onChunk = vi.fn();
      await client.sendMessage(
        'agent/a',
        [{role: 'user', content: 'Hi'}],
        {streamingEnabled: false},
        onChunk
      );

      expect(onChunk).toHaveBeenCalledWith(
        '',
        [
          {
            id: 'tc1',
            type: 'function',
            function: {name: 'search', arguments: '{"q":"test"}'},
          },
        ],
        undefined
      );
    });

    it('should handle invalid raw JSON gracefully', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'bad-raw-q'});
      mockGetQuery.mockResolvedValue({
        status: {
          phase: 'done',
          response: {content: 'OK', raw: 'not-json'},
        },
      });

      const onChunk = vi.fn();
      const result = await client.sendMessage(
        'agent/a',
        [{role: 'user', content: 'Hi'}],
        {streamingEnabled: false},
        onChunk
      );

      expect(result).toBe('OK');
      expect(onChunk).toHaveBeenCalledWith('OK', undefined, undefined);
    });

    it('should return empty string when canceled and call content onChunk', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'cancel-q'});
      mockGetQuery.mockResolvedValue({
        status: {phase: 'canceled', response: {content: ''}},
      });

      const result = await client.sendMessage(
        'agent/a',
        [{role: 'user', content: 'Hi'}],
        {streamingEnabled: false}
      );

      expect(result).toBe('');
    });

    it('should return empty string when aborted via signal', async () => {
      const client = new ChatClient(mockArkApiClient);
      const controller = new AbortController();
      controller.abort();

      mockCreateQuery.mockResolvedValue({name: 'abort-q'});

      const result = await client.sendMessage(
        'agent/a',
        [{role: 'user', content: 'Hi'}],
        {streamingEnabled: false},
        undefined,
        controller.signal
      );

      expect(result).toBe('');
    });
  });

  describe('pollStreamResponse', () => {
    function mockSSEResponse(chunks: string[]) {
      let index = 0;
      const encoder = new TextEncoder();
      return {
        ok: true,
        body: {
          getReader: () => ({
            read: vi.fn(async () => {
              if (index < chunks.length) {
                return {done: false, value: encoder.encode(chunks[index++])};
              }
              return {done: true, value: undefined};
            }),
            releaseLock: vi.fn(),
          }),
        },
      };
    }

    it('should parse SSE data chunks and call onChunk', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'stream-q'});

      const sseData = 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[{"delta":{"content":" World"}}]}\n\ndata: [DONE]\n\n';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockSSEResponse([sseData])));

      const onChunk = vi.fn();
      const result = await client.sendMessage(
        'agent/a',
        [{role: 'user', content: 'Hi'}],
        {streamingEnabled: true},
        onChunk
      );

      expect(result).toBe('Hello World');
      expect(onChunk).toHaveBeenCalledWith('Hello', undefined, undefined);
      expect(onChunk).toHaveBeenCalledWith(' World', undefined, undefined);

      vi.unstubAllGlobals();
    });

    it('should accumulate tool calls by index', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'tc-stream-q'});

      const chunk1 = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tc1","type":"function","function":{"name":"search","arguments":""}}]}}]}\n\n';
      const chunk2 = 'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"q\\":\\"test\\"}"}}]}}]}\n\n';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockSSEResponse([chunk1 + chunk2])));

      const onChunk = vi.fn();
      await client.sendMessage(
        'agent/a',
        [{role: 'user', content: 'Hi'}],
        {streamingEnabled: true},
        onChunk
      );

      const lastToolCallInvocation = onChunk.mock.calls
        .filter(call => call[1] !== undefined)
        .pop();
      expect(lastToolCallInvocation).toBeDefined();
      expect(lastToolCallInvocation![1][0].function.arguments).toBe('{"q":"test"}');

      vi.unstubAllGlobals();
    });

    it('should fall back to pollResponse when fetch returns non-ok', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'fallback-q'});
      mockGetQuery.mockResolvedValue({
        status: {phase: 'done', response: {content: 'Polled'}},
      });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: false}));

      const onChunk = vi.fn();
      const result = await client.sendMessage(
        'agent/a',
        [{role: 'user', content: 'Hi'}],
        {streamingEnabled: true},
        onChunk
      );

      expect(result).toBe('Polled');
      expect(mockGetQuery).toHaveBeenCalledWith('fallback-q');

      vi.unstubAllGlobals();
    });

    it('should fall back to pollResponse when no reader available', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'no-reader-q'});
      mockGetQuery.mockResolvedValue({
        status: {phase: 'done', response: {content: 'Polled again'}},
      });

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok: true, body: null}));

      const result = await client.sendMessage(
        'agent/a',
        [{role: 'user', content: 'Hi'}],
        {streamingEnabled: true},
        vi.fn()
      );

      expect(result).toBe('Polled again');

      vi.unstubAllGlobals();
    });

    it('should extract content from completedQuery metadata when no streamed content', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'completed-q'});

      const sseData = 'data: {"choices":[{"delta":{}}],"ark":{"completedQuery":{"status":{"response":{"content":"From completed"}}}}}\n\n';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockSSEResponse([sseData])));

      const onChunk = vi.fn();
      const result = await client.sendMessage(
        'agent/a',
        [{role: 'user', content: 'Hi'}],
        {streamingEnabled: true},
        onChunk
      );

      expect(result).toBe('From completed');
      expect(onChunk).toHaveBeenCalledWith(
        'From completed',
        undefined,
        expect.objectContaining({completedQuery: expect.any(Object)})
      );

      vi.unstubAllGlobals();
    });

    it('should pass ark metadata to onChunk', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'meta-q'});

      const sseData = 'data: {"choices":[{"delta":{"content":"Hi"}}],"ark":{"agent":"my-agent","query":"meta-q"}}\n\n';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockSSEResponse([sseData])));

      const onChunk = vi.fn();
      await client.sendMessage(
        'agent/a',
        [{role: 'user', content: 'Hi'}],
        {streamingEnabled: true},
        onChunk
      );

      expect(onChunk).toHaveBeenCalledWith(
        'Hi',
        undefined,
        expect.objectContaining({agent: 'my-agent', query: 'meta-q'})
      );

      vi.unstubAllGlobals();
    });

    it('should skip non-data and invalid JSON lines', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'skip-q'});

      const sseData = ':comment\n\nevent: ping\n\ndata: {invalid json}\n\ndata: {"choices":[{"delta":{"content":"Valid"}}]}\n\n';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockSSEResponse([sseData])));

      const onChunk = vi.fn();
      const result = await client.sendMessage(
        'agent/a',
        [{role: 'user', content: 'Hi'}],
        {streamingEnabled: true},
        onChunk
      );

      expect(result).toBe('Valid');
      expect(onChunk).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it('should handle multi-chunk buffer splits correctly', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateQuery.mockResolvedValue({name: 'multi-q'});

      const part1 = 'data: {"choices":[{"delta":{"content":"Hel';
      const part2 = 'lo"}}]}\n\ndata: {"choices":[{"delta":{"content":" World"}}]}\n\n';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockSSEResponse([part1, part2])));

      const onChunk = vi.fn();
      const result = await client.sendMessage(
        'agent/a',
        [{role: 'user', content: 'Hi'}],
        {streamingEnabled: true},
        onChunk
      );

      expect(result).toBe('Hello World');

      vi.unstubAllGlobals();
    });
  });
});
