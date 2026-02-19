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

    it('throws error when models list fails', async () => {
      mockOpenAI.models.list.mockRejectedValue(new Error('Connection refused'));

      await expect(client.getQueryTargets()).rejects.toThrow(
        'Failed to get query targets: Connection refused'
      );
    });

    it('handles non-Error exceptions', async () => {
      mockOpenAI.models.list.mockRejectedValue('string error');

      await expect(client.getQueryTargets()).rejects.toThrow(
        'Failed to get query targets: Unknown error'
      );
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

    it('throws error on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(client.getAgents()).rejects.toThrow(
        'Failed to get agents: HTTP error! status: 500'
      );
    });

    it('throws error on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(client.getAgents()).rejects.toThrow(
        'Failed to get agents: Network error'
      );
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

    it('throws error on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(client.getModels()).rejects.toThrow(
        'Failed to get models: HTTP error! status: 404'
      );
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

    it('throws error on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
      });

      await expect(client.getTools()).rejects.toThrow(
        'Failed to get tools: HTTP error! status: 503'
      );
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

    it('throws error on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      await expect(client.getTeams()).rejects.toThrow(
        'Failed to get teams: HTTP error! status: 401'
      );
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

    it('throws error on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(client.getSessions()).rejects.toThrow(
        'Failed to get sessions: HTTP error! status: 500'
      );
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

    it('throws error on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(client.deleteSession('nonexistent')).rejects.toThrow(
        'Failed to delete session: HTTP error! status: 404'
      );
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

    it('throws error on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(client.deleteQueryMessages('s1', 'q1')).rejects.toThrow(
        'Failed to delete query messages: HTTP error! status: 500'
      );
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

    it('throws error on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(client.deleteAllSessions()).rejects.toThrow(
        'Failed to delete all sessions: HTTP error! status: 500'
      );
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
