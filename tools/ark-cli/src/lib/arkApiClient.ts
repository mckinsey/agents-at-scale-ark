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
  private baseUrl: string;

  constructor(arkApiUrl: string) {
    this.baseUrl = arkApiUrl;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async getQueryTargets(): Promise<QueryTarget[]> {
    try {
      const targets: QueryTarget[] = [];
      const endpoints = [
        { type: 'agent', path: '/v1/agents' },
        { type: 'model', path: '/v1/models' },
        { type: 'team', path: '/v1/teams' },
        { type: 'tool', path: '/v1/tools' },
      ];

      for (const ep of endpoints) {
        try {
          const response = await fetch(`${this.baseUrl}${ep.path}`);
          if (response.ok) {
            const data = (await response.json()) as { items?: Array<{ name: string; description?: string }> };
            for (const item of data.items || []) {
              targets.push({
                id: `${ep.type}/${item.name}`,
                name: item.name,
                type: ep.type,
                description: item.description || item.name,
              });
            }
          }
        } catch {
          // Skip unavailable resource types
        }
      }

      return targets;
    } catch (error) {
      throw new Error(
        `Failed to get query targets: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {cause: error}
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
        `Failed to get agents: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {cause: error}
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
        `Failed to get models: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {cause: error}
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
        `Failed to get tools: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {cause: error}
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
        `Failed to get teams: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {cause: error}
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
        `Failed to get sessions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {cause: error}
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
        `Failed to delete session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {cause: error}
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
        `Failed to delete query messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {cause: error}
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
        `Failed to delete all sessions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        {cause: error}
      );
    }
  }

  async createQuery(params: {
    input: string;
    target: { type: string; name: string };
    sessionId?: string;
    conversationId?: string;
    timeout?: string;
    metadata?: { annotations?: Record<string, string> };
  }): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/v1/queries/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `cli-query-${Date.now()}`,
        type: 'user',
        input: params.input,
        target: params.target,
        sessionId: params.sessionId,
        conversationId: params.conversationId,
        timeout: params.timeout,
        ...(params.metadata ? { metadata: params.metadata } : {}),
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Query creation failed (${response.status}): ${text}`);
    }
    return (await response.json()) as Record<string, unknown>;
  }

  async getQuery(queryName: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/v1/queries/${queryName}`);
    if (!response.ok) {
      throw new Error(`Failed to get query: ${response.status}`);
    }
    return (await response.json()) as Record<string, unknown>;
  }
}
