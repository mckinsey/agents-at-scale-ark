import { trackEvent } from '@/lib/analytics/singleton';
import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';

// Helper type for axios errors
interface AxiosError extends Error {
  response?: {
    status: number;
  };
}

// Use the generated types from OpenAPI
export type AgentResponse = components['schemas']['AgentResponse'];
export type AgentDetailResponse = components['schemas']['AgentDetailResponse'];
export type AgentListResponse = components['schemas']['AgentListResponse'];
export type AgentCreateRequest = components['schemas']['AgentCreateRequest'];
export type AgentUpdateRequest = components['schemas']['AgentUpdateRequest'];

// AgentTool interface to match the API response structure
export interface AgentTool {
  type: string;
  name?: string | null;
  labelSelector?: {
    matchLabels?: Record<string, string> | null;
    matchExpressions?: Array<{
      key: string;
      operator: string;
      values?: string[] | null;
    }> | null;
  } | null;
}

// Interface for skill objects based on a2a-enhanced-agent.yaml
export interface Skill {
  id: string;
  name: string;
  description?: string | null;
  tags?: string[] | null;
}

// Extended AgentDetailResponse with A2A properties
export type AgentDetailResponseWithA2A = AgentDetailResponse & {
  // A2A properties are now part of the base AgentDetailResponse schema
};

// For UI compatibility, we'll map the API response to include an id field
export type Agent = AgentDetailResponseWithA2A & { id: string };

// CRUD Operations
export const agentsService = {
  // Get all agents
  async getAll(): Promise<Agent[]> {
    const response = await apiClient.get<AgentListResponse>(`/api/v1/agents`);

    // Map the response items to include id for UI compatibility
    const agents = await Promise.all(
      response.items.map(async item => {
        // Fetch detailed info for each agent to get full data
        const detailed = await agentsService.getByName(item.name);
        return detailed!;
      }),
    );

    return agents;
  },

  // Get a single agent by name
  async getByName(name: string): Promise<Agent | null> {
    try {
      const response = await apiClient.get<AgentDetailResponse>(
        `/api/v1/agents/${name}`,
      );
      return {
        ...response,
        id: response.name, // Use name as id for UI compatibility
      };
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  // Get a single agent by ID (for UI compatibility - ID is actually the name)
  async getById(id: number | string): Promise<Agent | null> {
    // Convert numeric ID to string name
    const name = String(id);
    return agentsService.getByName(name);
  },

  async create(agent: AgentCreateRequest): Promise<Agent> {
    const response = await apiClient.post<AgentDetailResponse>(
      `/api/v1/agents`,
      agent,
    );

    trackEvent({
      name: 'agent_created',
      properties: {
        agentName: response.name,
        hasTools: (agent.tools?.length ?? 0) > 0,
        toolCount: agent.tools?.length ?? 0,
      },
    });

    return {
      ...response,
      id: response.name,
    };
  },

  async update(
    name: string,
    updates: AgentUpdateRequest,
  ): Promise<Agent | null> {
    try {
      const response = await apiClient.put<AgentDetailResponse>(
        `/api/v1/agents/${name}`,
        updates,
      );

      trackEvent({
        name: 'agent_updated',
        properties: {
          agentName: response.name,
        },
      });

      return {
        ...response,
        id: response.name,
      };
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  // Update by ID (for UI compatibility)
  async updateById(
    id: number | string,
    updates: AgentUpdateRequest,
  ): Promise<Agent | null> {
    const name = String(id);
    return agentsService.update(name, updates);
  },

  async delete(name: string): Promise<boolean> {
    try {
      await apiClient.delete(`/api/v1/agents/${name}`);

      trackEvent({
        name: 'agent_deleted',
        properties: {
          agentName: name,
        },
      });

      return true;
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) {
        return false;
      }
      throw error;
    }
  },

  // Delete by ID (for UI compatibility)
  async deleteById(id: number | string): Promise<boolean> {
    const name = String(id);
    return agentsService.delete(name);
  },
};
