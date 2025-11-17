import OpenAI from 'openai';

export interface QueryTarget {
  id: string;
  name: string;
  type: 'agent' | 'model' | 'tool' | string;
  description?: string;
}

export interface Agent {
  name: string;
  namespace: string;
  description?: string;
  model_ref?: string;
  prompt?: string;
  status?: string;
  annotations?: Record<string, string>;
}

export interface Model {
  name: string;
  namespace: string;
  type: string;
  model: string;
  status: string;
  annotations?: Record<string, string>;
}

export interface Tool {
  name: string;
  namespace: string;
  description?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface Team {
  name: string;
  namespace: string;
  description?: string;
  strategy?: string;
  members_count?: number;
  status?: string;
}

export class ArkApiClient {
  private openai: OpenAI;
  private baseUrl: string;

  constructor(arkApiUrl: string) {
    this.baseUrl = arkApiUrl;
    this.openai = new OpenAI({
      baseURL: `${arkApiUrl}/openai/v1`,
      apiKey: 'dummy', // ark-api doesn't require an API key
      dangerouslyAllowBrowser: false,
      maxRetries: 0, // Disable automatic retries for query errors
    });
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async getQueryTargets(): Promise<QueryTarget[]> {
    try {
      const models = await this.openai.models.list();

      const targets: QueryTarget[] = models.data.map((model) => {
        const parts = model.id.split('/');
        const type = parts[0] || 'model';
        const name = parts.slice(1).join('/') || model.id;

        return {
          id: model.id,
          name,
          type,
          description: model.id,
        };
      });

      return targets;
    } catch (error) {
      throw new Error(
        `Failed to get query targets: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getAgents(): Promise<Agent[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/agents`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = (await response.json()) as {items?: Agent[]};
      return data.items || [];
    } catch (error) {
      throw new Error(
        `Failed to get agents: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getModels(): Promise<Model[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = (await response.json()) as {items?: Model[]};
      return data.items || [];
    } catch (error) {
      throw new Error(
        `Failed to get models: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getTools(): Promise<Tool[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/tools`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = (await response.json()) as {items?: Tool[]};
      return data.items || [];
    } catch (error) {
      throw new Error(
        `Failed to get tools: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getTeams(): Promise<Team[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/teams`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = (await response.json()) as {items?: Team[]};
      return data.items || [];
    } catch (error) {
      throw new Error(
        `Failed to get teams: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getSessions(): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/sessions`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = (await response.json()) as {items?: any[]};
      return data.items || [];
    } catch (error) {
      throw new Error(
        `Failed to get sessions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async deleteSession(sessionId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      throw new Error(
        `Failed to delete session: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async deleteQueryMessages(sessionId: string, queryId: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/v1/sessions/${sessionId}/queries/${queryId}/messages`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      throw new Error(
        `Failed to delete query messages: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async deleteAllSessions(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/sessions`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      throw new Error(
        `Failed to delete all sessions: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async createChatCompletion(
    params: OpenAI.Chat.Completions.ChatCompletionCreateParams
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    return (await this.openai.chat.completions.create({
      ...params,
      stream: false,
    })) as OpenAI.Chat.Completions.ChatCompletion;
  }

  async *createChatCompletionStream(
    params: OpenAI.Chat.Completions.ChatCompletionCreateParams
  ): AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> {
    // Errors from OpenAI SDK will automatically propagate with proper error messages
    // and kill the CLI, so no try/catch needed here
    const stream = await this.openai.chat.completions.create({
      ...params,
      stream: true,
    });

    for await (const chunk of stream) {
      yield chunk;
    }
  }
}
