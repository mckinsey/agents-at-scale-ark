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
export type TeamResponse = components['schemas']['TeamResponse'];
export type TeamDetailResponse = components['schemas']['TeamDetailResponse'];
export type TeamListResponse = components['schemas']['TeamListResponse'];
export type TeamCreateRequest = components['schemas']['TeamCreateRequest'];
export type TeamUpdateRequest = components['schemas']['TeamUpdateRequest'];
export type TeamMember = components['schemas']['TeamMember'];

// For UI compatibility, we'll map the API response to include an id field
export type Team = TeamDetailResponse & { id: string };

// CRUD Operations
export const teamsService = {
  // Get all teams
  async getAll(): Promise<Team[]> {
    const response = await apiClient.get<TeamListResponse>(`/api/v1/teams`);

    // Map the response items to include id for UI compatibility
    const teams = await Promise.all(
      response.items.map(async item => {
        // Fetch detailed info for each team to get full data
        const detailed = await teamsService.getByName(item.name);
        return detailed!;
      }),
    );

    return teams;
  },

  // Get a single team by name
  async getByName(name: string): Promise<Team | null> {
    try {
      const response = await apiClient.get<TeamDetailResponse>(
        `/api/v1/teams/${name}`,
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

  // Get a single team by ID (for UI compatibility - ID is actually the name)
  async getById(id: number | string): Promise<Team | null> {
    // Convert numeric ID to string name
    const name = String(id);
    return teamsService.getByName(name);
  },

  async create(team: TeamCreateRequest): Promise<Team> {
    const response = await apiClient.post<TeamDetailResponse>(
      `/api/v1/teams`,
      team,
    );

    trackEvent({
      name: 'team_created',
      properties: {
        teamName: response.name,
        memberCount: team.members?.length ?? 0,
        strategy: team.strategy,
      },
    });

    return {
      ...response,
      id: response.name,
    };
  },

  async update(name: string, updates: TeamUpdateRequest): Promise<Team | null> {
    try {
      const response = await apiClient.put<TeamDetailResponse>(
        `/api/v1/teams/${name}`,
        updates,
      );

      trackEvent({
        name: 'team_updated',
        properties: {
          teamName: response.name,
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
    updates: TeamUpdateRequest,
  ): Promise<Team | null> {
    const name = String(id);
    return teamsService.update(name, updates);
  },

  async delete(name: string): Promise<boolean> {
    try {
      await apiClient.delete(`/api/v1/teams/${name}`);

      trackEvent({
        name: 'team_deleted',
        properties: {
          teamName: name,
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
    return teamsService.delete(name);
  },
};
