import {vi, type Mock} from 'vitest';

const mockOpenAI = {
  models: {
    list: vi.fn(),
  },
  chat: {
    completions: {
      create: vi.fn(),
    },
  },
};

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => mockOpenAI),
}));

const mockFetch = vi.fn() as Mock;
global.fetch = mockFetch;

const {ArkApiClient} = await import('./arkApiClient.js');

describe('ArkApiClient', () => {
  let client: InstanceType<typeof ArkApiClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new ArkApiClient('http://localhost:8080');
  });

  describe('constructor', () => {
    it('creates client with correct base URL', () => {
      expect(client.getBaseUrl()).toBe('http://localhost:8080');
    });
  });

  describe('getQueryTargets', () => {
    it('returns query targets from models list', async () => {
      mockOpenAI.models.list.mockResolvedValue({
        data: [
          {id: 'agent/test-agent'},
          {id: 'model/test-model'},
        ],
      });

      const targets = await client.getQueryTargets();

      expect(targets).toEqual([
        {id: 'agent/test-agent', name: 'test-agent', type: 'agent', description: 'agent/test-agent'},
        {id: 'model/test-model', name: 'test-model', type: 'model', description: 'model/test-model'},
      ]);
    });

    it('throws error with cause when models list fails', async () => {
      const originalError = new Error('Connection refused');
      mockOpenAI.models.list.mockRejectedValue(originalError);

      try {
        await client.getQueryTargets();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to get query targets: Connection refused');
        expect((error as Error).cause).toBe(originalError);
      }
    });

    it('handles non-Error exceptions with cause', async () => {
      mockOpenAI.models.list.mockRejectedValue('string error');

      try {
        await client.getQueryTargets();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to get query targets: Unknown error');
        expect((error as Error).cause).toBe('string error');
      }
    });
  });

  describe('getAgents', () => {
    it('returns agents from API', async () => {
      const mockAgents = [{name: 'agent1'}, {name: 'agent2'}];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({items: mockAgents}),
      });

      const agents = await client.getAgents();

      expect(agents).toEqual(mockAgents);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8080/v1/agents');
    });

    it('returns empty array when no items', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const agents = await client.getAgents();

      expect(agents).toEqual([]);
    });

    it('throws error with cause on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      try {
        await client.getAgents();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to get agents: HTTP error! status: 500');
        expect((error as Error).cause).toBeInstanceOf(Error);
      }
    });

    it('throws error with cause on fetch failure', async () => {
      const originalError = new Error('Network error');
      mockFetch.mockRejectedValue(originalError);

      try {
        await client.getAgents();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to get agents: Network error');
        expect((error as Error).cause).toBe(originalError);
      }
    });

    it('handles non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('string error');

      try {
        await client.getAgents();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to get agents: Unknown error');
        expect((error as Error).cause).toBe('string error');
      }
    });
  });

  describe('getModels', () => {
    it('returns models from API', async () => {
      const mockModels = [{name: 'model1'}, {name: 'model2'}];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({items: mockModels}),
      });

      const models = await client.getModels();

      expect(models).toEqual(mockModels);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8080/v1/models');
    });

    it('throws error with cause on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      try {
        await client.getModels();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to get models: HTTP error! status: 404');
        expect((error as Error).cause).toBeInstanceOf(Error);
      }
    });

    it('handles non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('string error');

      try {
        await client.getModels();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to get models: Unknown error');
        expect((error as Error).cause).toBe('string error');
      }
    });
  });

  describe('getTools', () => {
    it('returns tools from API', async () => {
      const mockTools = [{name: 'tool1'}];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({items: mockTools}),
      });

      const tools = await client.getTools();

      expect(tools).toEqual(mockTools);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8080/v1/tools');
    });

    it('throws error with cause on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
      });

      try {
        await client.getTools();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to get tools: HTTP error! status: 503');
        expect((error as Error).cause).toBeInstanceOf(Error);
      }
    });

    it('handles non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('string error');

      try {
        await client.getTools();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to get tools: Unknown error');
        expect((error as Error).cause).toBe('string error');
      }
    });
  });

  describe('getTeams', () => {
    it('returns teams from API', async () => {
      const mockTeams = [{name: 'team1'}];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({items: mockTeams}),
      });

      const teams = await client.getTeams();

      expect(teams).toEqual(mockTeams);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8080/v1/teams');
    });

    it('throws error with cause on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      try {
        await client.getTeams();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to get teams: HTTP error! status: 401');
        expect((error as Error).cause).toBeInstanceOf(Error);
      }
    });

    it('handles non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('string error');

      try {
        await client.getTeams();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to get teams: Unknown error');
        expect((error as Error).cause).toBe('string error');
      }
    });
  });

  describe('getSessions', () => {
    it('returns sessions from API', async () => {
      const mockSessions = [{id: 'session1'}];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({items: mockSessions}),
      });

      const sessions = await client.getSessions();

      expect(sessions).toEqual(mockSessions);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8080/v1/sessions');
    });

    it('throws error with cause on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      try {
        await client.getSessions();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to get sessions: HTTP error! status: 500');
        expect((error as Error).cause).toBeInstanceOf(Error);
      }
    });

    it('handles non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('string error');

      try {
        await client.getSessions();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to get sessions: Unknown error');
        expect((error as Error).cause).toBe('string error');
      }
    });
  });

  describe('deleteSession', () => {
    it('deletes a session', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({deleted: true}),
      });

      const result = await client.deleteSession('session-123');

      expect(result).toEqual({deleted: true});
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/sessions/session-123',
        {method: 'DELETE'}
      );
    });

    it('throws error with cause on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      try {
        await client.deleteSession('nonexistent');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to delete session: HTTP error! status: 404');
        expect((error as Error).cause).toBeInstanceOf(Error);
      }
    });

    it('handles non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('string error');

      try {
        await client.deleteSession('session-123');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to delete session: Unknown error');
        expect((error as Error).cause).toBe('string error');
      }
    });
  });

  describe('deleteQueryMessages', () => {
    it('deletes query messages', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({deleted: true}),
      });

      const result = await client.deleteQueryMessages('session-1', 'query-1');

      expect(result).toEqual({deleted: true});
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/sessions/session-1/queries/query-1/messages',
        {method: 'DELETE'}
      );
    });

    it('throws error with cause on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      try {
        await client.deleteQueryMessages('s1', 'q1');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to delete query messages: HTTP error! status: 500');
        expect((error as Error).cause).toBeInstanceOf(Error);
      }
    });

    it('handles non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('string error');

      try {
        await client.deleteQueryMessages('s1', 'q1');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to delete query messages: Unknown error');
        expect((error as Error).cause).toBe('string error');
      }
    });
  });

  describe('deleteAllSessions', () => {
    it('deletes all sessions', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({deletedCount: 5}),
      });

      const result = await client.deleteAllSessions();

      expect(result).toEqual({deletedCount: 5});
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/sessions',
        {method: 'DELETE'}
      );
    });

    it('throws error with cause on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      try {
        await client.deleteAllSessions();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to delete all sessions: HTTP error! status: 500');
        expect((error as Error).cause).toBeInstanceOf(Error);
      }
    });

    it('handles non-Error exceptions', async () => {
      mockFetch.mockRejectedValue('string error');

      try {
        await client.deleteAllSessions();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Failed to delete all sessions: Unknown error');
        expect((error as Error).cause).toBe('string error');
      }
    });
  });

  describe('createChatCompletion', () => {
    it('creates non-streaming chat completion', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        choices: [{message: {content: 'Hello!'}}],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await client.createChatCompletion({
        model: 'gpt-4',
        messages: [{role: 'user', content: 'Hi'}],
      });

      expect(result).toEqual(mockResponse);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [{role: 'user', content: 'Hi'}],
        stream: false,
      });
    });
  });

  describe('createChatCompletionStream', () => {
    it('creates streaming chat completion', async () => {
      const mockChunks = [
        {choices: [{delta: {content: 'Hello'}}]},
        {choices: [{delta: {content: ' World'}}]},
      ];
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of mockChunks) {
            yield chunk;
          }
        },
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockStream);

      const chunks = [];
      for await (const chunk of client.createChatCompletionStream({
        model: 'gpt-4',
        messages: [{role: 'user', content: 'Hi'}],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(mockChunks);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [{role: 'user', content: 'Hi'}],
        stream: true,
      });
    });
  });
});
