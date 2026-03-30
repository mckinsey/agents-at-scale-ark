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
  });
});
