import {jest} from '@jest/globals';

const mockFetch = jest.fn() as any;
global.fetch = mockFetch;

const {ChatClient} = await import('./chatClient.js');

describe('ChatClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendMessage', () => {
    it('should include sessionId in queryAnnotations when provided', async () => {
      const client = new ChatClient('http://localhost:8080');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
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
        }),
      });

      await client.sendMessage(
        'agent/test-agent',
        [{role: 'user', content: 'Hello'}],
        {streamingEnabled: false, sessionId: 'test-session-123'}
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/openai/v1/chat/completions'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('test-session-123'),
        })
      );

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.metadata).toBeDefined();
      expect(body.metadata.queryAnnotations).toBeDefined();
      const queryAnnotations = JSON.parse(body.metadata.queryAnnotations);
      expect(queryAnnotations.sessionId).toBe('test-session-123');
    });

    it('should include both sessionId and a2aContextId in queryAnnotations when both provided', async () => {
      const client = new ChatClient('http://localhost:8080');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
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
        }),
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

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.metadata).toBeDefined();
      expect(body.metadata.queryAnnotations).toBeDefined();
      const queryAnnotations = JSON.parse(body.metadata.queryAnnotations);
      expect(queryAnnotations.sessionId).toBe('test-session-123');
      expect(queryAnnotations['ark.mckinsey.com/a2a-context-id']).toBe(
        'a2a-context-456'
      );
    });

    it('should not include metadata when neither sessionId nor a2aContextId is provided', async () => {
      const client = new ChatClient('http://localhost:8080');
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
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
        }),
      });

      await client.sendMessage(
        'agent/test-agent',
        [{role: 'user', content: 'Hello'}],
        {streamingEnabled: false}
      );

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.metadata).toBeUndefined();
    });
  });
});

