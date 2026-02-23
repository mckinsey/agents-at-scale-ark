import {jest} from '@jest/globals';
import {QUERY_ANNOTATIONS} from './constants.js';

const mockCreateChatCompletion = jest.fn() as any;

const mockArkApiClient = {
  createChatCompletion: mockCreateChatCompletion,
  createChatCompletionStream: jest.fn() as any,
  getQueryTargets: jest.fn() as any,
} as any;

const {ChatClient} = await import('./chatClient.js');

describe('ChatClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('should include sessionId directly in metadata when provided', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateChatCompletion.mockResolvedValue({
        id: 'test-id',
        object: 'chat.completion',
        created: 1234567890,
        model: 'test-model',
        choices: [
          {
            index: 0,
            message: {role: 'assistant', content: 'Hello'},
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      });

      await client.sendMessage(
        'agent/test-agent',
        [{role: 'user', content: 'Hello'}],
        {streamingEnabled: false, sessionId: 'test-session-123'}
      );

      expect(mockCreateChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'agent/test-agent',
          messages: [{role: 'user', content: 'Hello'}],
          metadata: {
            sessionId: 'test-session-123',
          },
        })
      );
    });

    it('should include both sessionId in metadata and a2aContextId in queryAnnotations when both provided', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateChatCompletion.mockResolvedValue({
        id: 'test-id',
        object: 'chat.completion',
        created: 1234567890,
        model: 'test-model',
        choices: [
          {
            index: 0,
            message: {role: 'assistant', content: 'Hello'},
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
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

      expect(mockCreateChatCompletion).toHaveBeenCalled();
      const callArgs = mockCreateChatCompletion.mock.calls[0][0];
      expect(callArgs.model).toBe('agent/test-agent');
      expect(callArgs.messages).toEqual([{role: 'user', content: 'Hello'}]);
      expect(callArgs.metadata).toBeDefined();
      expect(callArgs.metadata.sessionId).toBe('test-session-123');
      expect(callArgs.metadata.queryAnnotations).toBeDefined();
      const queryAnnotations = JSON.parse(callArgs.metadata.queryAnnotations);
      expect(queryAnnotations[QUERY_ANNOTATIONS.A2A_CONTEXT_ID]).toBe(
        'a2a-context-456'
      );
    });

    it('should emit completedQuery response content when no content was streamed', async () => {
      const client = new ChatClient(mockArkApiClient);
      const chunks: Array<{
        chunk: string;
        toolCalls?: any[];
        arkMetadata?: any;
      }> = [];

      const mockStream = (async function* () {
        yield {
          choices: [{delta: {content: ''}}],
          ark: {
            completedQuery: {
              status: {
                response: {
                  content: 'Tool result content',
                },
              },
            },
          },
        };
      })();

      (mockArkApiClient.createChatCompletionStream as any).mockReturnValue(
        mockStream
      );

      const result = await client.sendMessage(
        'tool/my-tool',
        [{role: 'user', content: '{"input": "test"}'}],
        {streamingEnabled: true},
        (chunk: string, toolCalls?: any[], arkMetadata?: any) => {
          chunks.push({chunk, toolCalls, arkMetadata});
        }
      );

      expect(result).toBe('Tool result content');
      const contentChunks = chunks.filter((c) => c.chunk !== '');
      expect(contentChunks).toHaveLength(1);
      expect(contentChunks[0].chunk).toBe('Tool result content');
    });

    it('should not emit completedQuery content when content was already streamed', async () => {
      const client = new ChatClient(mockArkApiClient);
      const chunks: Array<{
        chunk: string;
        toolCalls?: any[];
        arkMetadata?: any;
      }> = [];

      const mockStream = (async function* () {
        yield {
          choices: [{delta: {content: 'Streamed content'}}],
        };
        yield {
          choices: [{delta: {content: ''}}],
          ark: {
            completedQuery: {
              status: {
                response: {
                  content: 'Streamed content',
                },
              },
            },
          },
        };
      })();

      (mockArkApiClient.createChatCompletionStream as any).mockReturnValue(
        mockStream
      );

      const result = await client.sendMessage(
        'agent/my-agent',
        [{role: 'user', content: 'Hello'}],
        {streamingEnabled: true},
        (chunk: string, toolCalls?: any[], arkMetadata?: any) => {
          chunks.push({chunk, toolCalls, arkMetadata});
        }
      );

      expect(result).toBe('Streamed content');
      const contentChunks = chunks.filter((c) => c.chunk !== '');
      expect(contentChunks).toHaveLength(1);
      expect(contentChunks[0].chunk).toBe('Streamed content');
    });

    it('should not include metadata when neither sessionId nor a2aContextId is provided', async () => {
      const client = new ChatClient(mockArkApiClient);
      mockCreateChatCompletion.mockResolvedValue({
        id: 'test-id',
        object: 'chat.completion',
        created: 1234567890,
        model: 'test-model',
        choices: [
          {
            index: 0,
            message: {role: 'assistant', content: 'Hello'},
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      });

      await client.sendMessage(
        'agent/test-agent',
        [{role: 'user', content: 'Hello'}],
        {streamingEnabled: false}
      );

      expect(mockCreateChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'agent/test-agent',
          messages: [{role: 'user', content: 'Hello'}],
        })
      );
      const callArgs = mockCreateChatCompletion.mock.calls[0];
      expect(callArgs[0].metadata).toBeUndefined();
    });
  });
});
