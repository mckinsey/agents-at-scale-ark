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
  private namespace: string;

  constructor(arkApiUrl: string, namespace: string = 'default') {
    this.baseUrl = arkApiUrl;
    this.namespace = namespace;
    this.openai = new OpenAI({
      baseURL: `${arkApiUrl}/openai/v1`,
      apiKey: 'dummy', // ark-api doesn't require an API key
      dangerouslyAllowBrowser: false,
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
      const response = await fetch(
        `${this.baseUrl}/v1/namespaces/${this.namespace}/agents`
      );
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
      const response = await fetch(
        `${this.baseUrl}/v1/namespaces/${this.namespace}/models`
      );
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
      const response = await fetch(
        `${this.baseUrl}/v1/namespaces/${this.namespace}/tools`
      );
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
      const response = await fetch(
        `${this.baseUrl}/v1/namespaces/${this.namespace}/teams`
      );
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
    const stream = await this.openai.chat.completions.create({
      ...params,
      stream: true,
    });

    for await (const chunk of stream) {
      yield chunk;
    }
  }
}
