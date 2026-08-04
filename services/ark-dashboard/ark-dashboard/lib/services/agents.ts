import { trackEvent } from '@/lib/analytics/singleton';
import { apiClient, APIError } from '@/lib/api/client';
import { fetchAllPages, fetchPage, type Page } from '@/lib/api/pagination';
import type { components } from '@/lib/api/generated/types';

// Use the generated types from OpenAPI
export type AgentResponse = components['schemas']['AgentResponse'];
export type AgentDetailResponse = components['schemas']['AgentDetailResponse'];
export type AgentListResponse = components['schemas']['AgentListResponse'];
export type AgentCreateRequest = components['schemas']['AgentCreateRequest'];
export type AgentUpdateRequest = components['schemas']['AgentUpdateRequest'];

/**
 * Shape returned by list endpoints (`GET /agents`). Carries only the fields
 * ark-api includes in the list payload — use `getByName` when detail-only
 * fields (tools, parameters, execution engine, …) are required.
 */
export type AgentListItem = AgentResponse & { id: string };

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
  /**
   * Fetch one page of agents (server-side pagination). Prefer this over
   * `getAll` for list UIs so we don't materialize every agent in memory.
   */
  async getPage(
    continueToken: string | null = null,
  ): Promise<Page<AgentListItem>> {
    const page = await fetchPage<AgentResponse>(
      `/api/v1/agents`,
      continueToken,
    );
    return {
      items: page.items.map(item => ({ ...item, id: item.name })),
      continueToken: page.continueToken,
    };
  },

  /**
   * Fetch every agent across all pages. Returns list-payload shape only
   * (no per-agent detail fetch) — callers that need detail fields must
   * call `getByName` explicitly to avoid the N+1 fanout.
   */
  async getAll(): Promise<AgentListItem[]> {
    const items = await fetchAllPages<AgentResponse>(`/api/v1/agents`);
    return items.map(item => ({ ...item, id: item.name }));
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
      if (error instanceof APIError && error.status === 404) {
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
      if (error instanceof APIError && error.status === 404) {
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
      if (error instanceof APIError && error.status === 404) {
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

  async getRawResource(name: string): Promise<Record<string, unknown>> {
    return apiClient.get<Record<string, unknown>>(
      `/api/v1/resources/apis/ark.mckinsey.com/v1alpha1/Agent/${name}`,
    );
  },
};
