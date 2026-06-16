import {vi, type Mock} from 'vitest';

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
    it('returns query targets from resource endpoints', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/v1/agents')) {
          return {ok: true, json: async () => ({items: [{name: 'test-agent'}]})};
        }
        if (url.includes('/v1/models')) {
          return {ok: true, json: async () => ({items: [{name: 'test-model'}]})};
        }
        return {ok: true, json: async () => ({items: []})};
      });

      const targets = await client.getQueryTargets();

      expect(targets).toContainEqual({
        id: 'agent/test-agent',
        name: 'test-agent',
        type: 'agent',
        description: 'test-agent',
      });
      expect(targets).toContainEqual({
        id: 'model/test-model',
        name: 'test-model',
        type: 'model',
        description: 'test-model',
      });
    });

    it('skips unavailable resource types', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/v1/agents')) {
          return {ok: true, json: async () => ({items: [{name: 'agent1'}]})};
        }
        throw new Error('Connection refused');
      });

      const targets = await client.getQueryTargets();
      expect(targets).toHaveLength(1);
      expect(targets[0].name).toBe('agent1');
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

  describe('createQuery', () => {
    it('creates a query via the API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({name: 'cli-query-123', status: {phase: 'pending'}}),
      });

      const result = await client.createQuery({
        input: 'Hello',
        target: {type: 'agent', name: 'test-agent'},
      });

      expect(result).toEqual({name: 'cli-query-123', status: {phase: 'pending'}});
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/v1/queries/',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"input":"Hello"'),
        }),
      );
    });

    it('throws on query creation failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(
        client.createQuery({
          input: 'Hello',
          target: {type: 'agent', name: 'test-agent'},
        })
      ).rejects.toThrow('Query creation failed');
    });
  });

  describe('getQuery', () => {
    it('fetches query by name', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({name: 'test-q', status: {phase: 'done'}}),
      });

      const result = await client.getQuery('test-q');
      expect(result).toEqual({name: 'test-q', status: {phase: 'done'}});
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:8080/v1/queries/test-q');
    });
  });
});
