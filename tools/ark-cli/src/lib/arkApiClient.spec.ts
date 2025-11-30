import {jest} from '@jest/globals';

// Mock OpenAI
const mockOpenAI = {
  models: {
    list: jest.fn(),
  },
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
};

const MockOpenAIClass = jest.fn(() => mockOpenAI);

jest.unstable_mockModule('openai', () => ({
  default: MockOpenAIClass,
}));

// Mock global fetch
const mockFetch = jest.fn() as any;
global.fetch = mockFetch;

const {ArkApiClient} = await import('./arkApiClient.js');

describe('ArkApiClient', () => {
  let client: any;
  const baseUrl = 'http://test-api';

  beforeEach(() => {
    jest.clearAllMocks();
    client = new ArkApiClient(baseUrl);
  });

  describe('constructor', () => {
    it('should initialize with correct base URL and OpenAI client', () => {
      expect(client.getBaseUrl()).toBe(baseUrl);
      expect(MockOpenAIClass).toHaveBeenCalledWith({
        baseURL: `${baseUrl}/openai/v1`,
        apiKey: 'dummy',
        dangerouslyAllowBrowser: false,
        maxRetries: 0,
      });
    });
  });

  describe('getQueryTargets', () => {
    it('should return formatted query targets from models', async () => {
      const mockModels = {
        data: [
          {id: 'agent/test-agent'},
          {id: 'model/gpt-4'},
          {id: 'simple-model'},
        ],
      };
      (mockOpenAI.models.list as any).mockResolvedValue(mockModels);

      const targets = await client.getQueryTargets();

      expect(targets).toHaveLength(3);
      expect(targets[0]).toEqual({
        id: 'agent/test-agent',
        name: 'test-agent',
        type: 'agent',
        description: 'agent/test-agent',
      });
      expect(targets[1]).toEqual({
        id: 'model/gpt-4',
        name: 'gpt-4',
        type: 'model',
        description: 'model/gpt-4',
      });
      expect(targets[2]).toEqual({
        id: 'simple-model',
        name: 'simple-model',
        type: 'simple-model',
        description: 'simple-model',
      });
    });

    it('should throw error on failure', async () => {
      (mockOpenAI.models.list as any).mockRejectedValue(new Error('API Error'));
      await expect(client.getQueryTargets()).rejects.toThrow('Failed to get query targets: API Error');
    });
  });

  describe('getAgents', () => {
    it('should return agents list', async () => {
      const mockAgents = {items: [{name: 'agent1'}]};
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockAgents,
      });

      const agents = await client.getAgents();
      expect(agents).toEqual(mockAgents.items);
      expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/v1/agents`);
    });

    it('should throw error on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });
      await expect(client.getAgents()).rejects.toThrow('Failed to get agents: HTTP error! status: 500');
    });
  });

  describe('getModels', () => {
    it('should return models list', async () => {
      const mockModels = {items: [{name: 'model1'}]};
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockModels,
      });

      const models = await client.getModels();
      expect(models).toEqual(mockModels.items);
      expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/v1/models`);
    });
  });

  describe('getTools', () => {
    it('should return tools list', async () => {
      const mockTools = {items: [{name: 'tool1'}]};
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockTools,
      });

      const tools = await client.getTools();
      expect(tools).toEqual(mockTools.items);
      expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/v1/tools`);
    });
  });

  describe('getTeams', () => {
    it('should return teams list', async () => {
      const mockTeams = {items: [{name: 'team1'}]};
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockTeams,
      });

      const teams = await client.getTeams();
      expect(teams).toEqual(mockTeams.items);
      expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/v1/teams`);
    });
  });

  describe('getSessions', () => {
    it('should return sessions list', async () => {
      const mockSessions = {items: [{id: 'session1'}]};
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockSessions,
      });

      const sessions = await client.getSessions();
      expect(sessions).toEqual(mockSessions.items);
      expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/v1/sessions`);
    });
  });

  describe('deleteSession', () => {
    it('should delete session', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({success: true}),
      });

      const result = await client.deleteSession('session1');
      expect(result).toEqual({success: true});
      expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/v1/sessions/session1`, {
        method: 'DELETE',
      });
    });
  });

  describe('deleteQueryMessages', () => {
    it('should delete query messages', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({success: true}),
      });

      const result = await client.deleteQueryMessages('session1', 'query1');
      expect(result).toEqual({success: true});
      expect(mockFetch).toHaveBeenCalledWith(
        `${baseUrl}/v1/sessions/session1/queries/query1/messages`,
        {method: 'DELETE'}
      );
    });
  });

  describe('deleteAllSessions', () => {
    it('should delete all sessions', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({success: true}),
      });

      const result = await client.deleteAllSessions();
      expect(result).toEqual({success: true});
      expect(mockFetch).toHaveBeenCalledWith(`${baseUrl}/v1/sessions`, {
        method: 'DELETE',
      });
    });
  });

  describe('createChatCompletion', () => {
    it('should call openai create with stream false', async () => {
      const params = {messages: [], model: 'gpt-4'};
      const mockResponse = {id: 'resp1'};
      (mockOpenAI.chat.completions.create as any).mockResolvedValue(mockResponse);

      const result = await client.createChatCompletion(params);
      expect(result).toBe(mockResponse);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        ...params,
        stream: false,
      });
    });
  });

  describe('createChatCompletionStream', () => {
    it('should yield chunks from stream', async () => {
      const params = {messages: [], model: 'gpt-4'};
      const mockChunks = ['chunk1', 'chunk2'];
      
      async function* mockStream() {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      }

      (mockOpenAI.chat.completions.create as any).mockResolvedValue(mockStream());

      const chunks = [];
      for await (const chunk of client.createChatCompletionStream(params)) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(mockChunks);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        ...params,
        stream: true,
      });
    });
  });
});
