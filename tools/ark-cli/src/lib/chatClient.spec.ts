import {jest} from '@jest/globals';

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
    it('should include sessionId in queryAnnotations when provided', async () => {
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
            queryAnnotations: JSON.stringify({
              sessionId: 'test-session-123',
            }),
          },
        })
      );
    });

    it('should include both sessionId and a2aContextId in queryAnnotations when both provided', async () => {
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

      expect(mockCreateChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'agent/test-agent',
          messages: [{role: 'user', content: 'Hello'}],
          metadata: {
            queryAnnotations: JSON.stringify({
              sessionId: 'test-session-123',
              'ark.mckinsey.com/a2a-context-id': 'a2a-context-456',
            }),
          },
        })
      );
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

